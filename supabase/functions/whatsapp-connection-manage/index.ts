// ============================================================================
// SUPABASE EDGE FUNCTION: whatsapp-connection-manage
// Handles server-side Meta Graph API calls, credentials verification,
// test message sending, outgoing inbox replies, status queries, and disconnection.
// Hardened error handling & step logging.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManageRequestBody {
  action: 'connect' | 'verify' | 'status' | 'disconnect' | 'test-message' | 'send-reply'
  workspace_id: string
  waba_id?: string
  phone_number_id?: string
  access_token?: string
  meta_business_id?: string
  recipient_phone?: string
  template_name?: string
  language_code?: string
  conversation_id?: string
  text_body?: string
}

function logAndSanitizeMetaError(action: string, status: number, metaData: Record<string, unknown>) {
  const metaErr = (metaData?.error || {}) as Record<string, unknown>
  const sanitized = {
    action,
    status,
    code: metaErr.code,
    subcode: metaErr.error_subcode,
    type: metaErr.type,
    message: metaErr.message,
    userTitle: metaErr.error_user_title,
    userMessage: metaErr.error_user_msg,
    traceId: metaErr.fbtrace_id,
  }

  console.error('[WhatsApp Meta API Error]', sanitized)

  return {
    success: false,
    error: 'META_TOKEN_INVALID',
    message: (metaErr.error_user_msg || metaErr.message || 'Meta rejected the WhatsApp request') as string,
    meta_status: status,
    meta_code: metaErr.code || null,
    meta_subcode: metaErr.error_subcode || null,
    meta_message: metaErr.message || null,
    meta_user_message: metaErr.error_user_msg || null,
    trace_id: metaErr.fbtrace_id || null,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const graphApiVersion = Deno.env.get('META_GRAPH_API_VERSION') || 'v26.0'

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (!authHeader || !token) {
      console.warn('[WhatsApp Connect Step] auth_verified', {
        step: 'auth_verified',
        success: false,
        errorCode: 'NOT_AUTHENTICATED',
      })
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please sign in again.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      console.warn('[WhatsApp Connect Step] auth_verified', {
        step: 'auth_verified',
        success: false,
        errorCode: 'SESSION_EXPIRED',
      })
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please sign in again.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const body: ManageRequestBody = await req.json()
    const { action, workspace_id } = body

    if (!workspace_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MISSING_WORKSPACE_ID',
          message: 'Missing workspace_id parameter.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[WhatsApp Connect Step] auth_verified', {
      action,
      workspace_id,
      user_id: user.id,
      step: 'auth_verified',
      success: true,
    })

    // Verify workspace membership & role
    const { data: member } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      console.warn('[WhatsApp Connect Step] membership_verified', {
        action,
        workspace_id,
        user_id: user.id,
        step: 'membership_verified',
        success: false,
        errorCode: 'WORKSPACE_ACCESS_DENIED',
      })
      return new Response(
        JSON.stringify({
          success: false,
          error: 'WORKSPACE_ACCESS_DENIED',
          message: 'You do not have access to this workspace.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[WhatsApp Connect Step] membership_verified', {
      action,
      workspace_id,
      user_id: user.id,
      step: 'membership_verified',
      success: true,
    })

    // 1. CONNECT ACTION (Owner Only)
    if (action === 'connect') {
      if (member.role !== 'owner') {
        console.warn('[WhatsApp Connect Step] role_verified', {
          action,
          workspace_id,
          user_id: user.id,
          step: 'role_verified',
          success: false,
          errorCode: 'INSUFFICIENT_ROLE',
        })
        return new Response(
          JSON.stringify({
            success: false,
            error: 'INSUFFICIENT_ROLE',
            message: 'Only workspace owners or managers can connect WhatsApp.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      console.log('[WhatsApp Connect Step] role_verified', {
        action,
        workspace_id,
        user_id: user.id,
        step: 'role_verified',
        success: true,
      })

      const { waba_id, phone_number_id, access_token, meta_business_id } = body
      if (!waba_id || !phone_number_id || !access_token) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'MISSING_CREDENTIALS',
            message: 'Missing required WhatsApp credentials.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        console.error('[WhatsApp Connect Step] meta_token_verified', {
          action,
          workspace_id,
          user_id: user.id,
          step: 'meta_token_verified',
          success: false,
        })
        const errorPayload = logAndSanitizeMetaError('connect', metaRes.status, metaData)
        return new Response(JSON.stringify(errorPayload), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('[WhatsApp Connect Step] meta_token_verified', {
        action,
        workspace_id,
        user_id: user.id,
        step: 'meta_token_verified',
        success: true,
      })

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('save_whatsapp_connection_credentials_rpc', {
        p_workspace_id: workspace_id,
        p_waba_id: waba_id,
        p_phone_number_id: phone_number_id,
        p_access_token: access_token,
        p_meta_business_id: meta_business_id || null,
        p_display_phone: metaData.display_phone_number || null,
        p_verified_name: metaData.verified_name || 'Verified Business',
        p_quality_rating: metaData.quality_rating || 'UNKNOWN',
        p_limit_tier: metaData.messaging_limit_tier || 'TIER_50',
        p_user_id: user.id,
      })

      if (rpcErr) {
        console.error('[WhatsApp Connect Step] connection_save_failed', {
          action,
          workspace_id,
          user_id: user.id,
          step: 'connection_save_failed',
          success: false,
          error: rpcErr.message,
        })
        return new Response(
          JSON.stringify({
            success: false,
            error: 'CONNECTION_SAVE_FAILED',
            message: 'WhatsApp connection could not be saved.',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      console.log('[WhatsApp Connect Step] connection_saved', {
        action,
        workspace_id,
        user_id: user.id,
        step: 'connection_saved',
        success: true,
      })

      console.log('[WhatsApp Connect Step] credentials_saved', {
        action,
        workspace_id,
        user_id: user.id,
        step: 'credentials_saved',
        success: true,
      })

      return new Response(JSON.stringify(rpcRes), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. VERIFY ACTION (Owner / Manager)
    if (action === 'verify') {
      if (member.role !== 'owner' && member.role !== 'manager') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'INSUFFICIENT_ROLE',
            message: 'Only workspace owners or managers can verify WhatsApp connections.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: creds } = await supabaseAdmin.rpc('get_whatsapp_connection_credentials_internal', {
        p_workspace_id: workspace_id,
      })

      if (!creds || creds.length === 0 || !creds[0]?.access_token?.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'CREDENTIALS_NOT_FOUND',
            message: 'WhatsApp access credential was not found or is missing.',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const activeToken = creds[0].access_token
      const activePhoneId = creds[0].phone_number_id

      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${activePhoneId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        const errorPayload = logAndSanitizeMetaError('verify', metaRes.status, metaData)
        return new Response(JSON.stringify(errorPayload), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'connected',
          verified_name: metaData.verified_name || 'Verified Business',
          display_phone_number: metaData.display_phone_number || '',
          quality_rating: metaData.quality_rating || 'UNKNOWN',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 3. STATUS ACTION
    if (action === 'status') {
      const { data: conn } = await supabaseAdmin
        .from('whatsapp_connections')
        .select('*')
        .eq('workspace_id', workspace_id)
        .single()

      return new Response(
        JSON.stringify({
          success: true,
          connection: conn || null,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 4. DISCONNECT ACTION (Owner Only)
    if (action === 'disconnect') {
      if (member.role !== 'owner') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'INSUFFICIENT_ROLE',
            message: 'Only workspace owners can disconnect WhatsApp Cloud API.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('disconnect_whatsapp_connection_rpc', {
        p_workspace_id: workspace_id,
        p_user_id: user.id,
      })

      if (rpcErr) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'DISCONNECT_FAILED',
            message: rpcErr.message,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(JSON.stringify(rpcRes), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. TEST MESSAGE ACTION (Owner / Manager)
    if (action === 'test-message') {
      if (member.role !== 'owner' && member.role !== 'manager') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'INSUFFICIENT_ROLE',
            message: 'Only workspace owners or managers can send test messages.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { recipient_phone, template_name = 'hello_world', language_code = 'en_US' } = body
      if (!recipient_phone) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'MISSING_RECIPIENT',
            message: 'Recipient phone number is required.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: creds } = await supabaseAdmin.rpc('get_whatsapp_connection_credentials_internal', {
        p_workspace_id: workspace_id,
      })

      if (!creds || creds.length === 0 || !creds[0]?.access_token?.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'CREDENTIALS_NOT_FOUND',
            message: 'WhatsApp connection credentials not configured.',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const activeToken = creds[0].access_token
      const activePhoneId = creds[0].phone_number_id
      const cleanPhone = recipient_phone.replace(/[^\d]/g, '')

      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${activePhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: template_name,
            language: { code: language_code },
          },
        }),
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        const errorPayload = logAndSanitizeMetaError('test-message', metaRes.status, metaData)
        return new Response(JSON.stringify(errorPayload), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const wamid = metaData.messages?.[0]?.id || 'unknown_wamid'

      return new Response(
        JSON.stringify({
          success: true,
          message_id: wamid,
          recipient_phone: cleanPhone,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 6. SEND REPLY ACTION (All active members)
    if (action === 'send-reply') {
      const { conversation_id, text_body } = body
      if (!conversation_id || !text_body?.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'MISSING_REPLY_PARAMS',
            message: 'Missing conversation_id or text_body for WhatsApp reply.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: conv } = await supabaseAdmin
        .from('whatsapp_conversations')
        .select('contact_phone')
        .eq('id', conversation_id)
        .eq('workspace_id', workspace_id)
        .single()

      if (!conv) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'CONVERSATION_NOT_FOUND',
            message: 'WhatsApp conversation not found.',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: creds } = await supabaseAdmin.rpc('get_whatsapp_connection_credentials_internal', {
        p_workspace_id: workspace_id,
      })

      if (!creds || creds.length === 0 || !creds[0]?.access_token?.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'CREDENTIALS_NOT_FOUND',
            message: 'WhatsApp connection credentials not configured.',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const activeToken = creds[0].access_token
      const activePhoneId = creds[0].phone_number_id

      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${activePhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: conv.contact_phone,
          type: 'text',
          text: { preview_url: false, body: text_body.trim() },
        }),
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        const errorPayload = logAndSanitizeMetaError('send-reply', metaRes.status, metaData)
        return new Response(JSON.stringify(errorPayload), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const wamid = metaData.messages?.[0]?.id || 'unknown_wamid'

      await supabaseAdmin.from('whatsapp_messages').insert({
        workspace_id,
        conversation_id,
        meta_message_id: wamid,
        direction: 'outgoing',
        message_type: 'text',
        text_body: text_body.trim(),
        status: 'sent',
        occurred_at: new Date().toISOString(),
      })

      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          last_message_preview: text_body.trim().slice(0, 100),
          last_message_direction: 'outgoing',
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation_id)

      return new Response(
        JSON.stringify({
          success: true,
          message_id: wamid,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'INVALID_ACTION',
        message: `Unknown action '${action}'`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: unknown) {
    console.error('[whatsapp-connection-manage Error]', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
