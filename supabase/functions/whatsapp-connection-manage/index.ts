// ============================================================================
// SUPABASE EDGE FUNCTION: whatsapp-connection-manage
// Handles server-side Meta Graph API calls, credentials verification,
// test message sending, status queries, and disconnection.
// Logs sanitized Meta error details without exposing access tokens or secrets.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManageRequestBody {
  action: 'connect' | 'verify' | 'status' | 'disconnect' | 'test-message'
  workspace_id: string
  waba_id?: string
  phone_number_id?: string
  access_token?: string
  meta_business_id?: string
  recipient_phone?: string
  template_name?: string
  language_code?: string
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
    error: (metaErr.error_user_msg || metaErr.message || 'Meta rejected the WhatsApp request') as string,
    meta_status: status,
    meta_code: metaErr.code || null,
    meta_subcode: metaErr.error_subcode || null,
    meta_message: metaErr.message || null,
    meta_user_message: metaErr.error_user_msg || null,
    trace_id: metaErr.fbtrace_id || null,
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const graphApiVersion = Deno.env.get('META_GRAPH_API_VERSION') || 'v26.0'
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      console.warn('[WhatsApp Manage] Missing Authorization header')
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify requesting user strictly from Authorization header JWT (never trust user_id from body)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      console.warn('[WhatsApp Manage] Unauthorized user token', authError)
      return new Response(JSON.stringify({ error: 'Unauthorized user token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: ManageRequestBody = await req.json()
    const { action, workspace_id } = body

    if (!workspace_id) {
      console.warn('[WhatsApp Manage] Missing workspace_id')
      return new Response(JSON.stringify({ error: 'Missing workspace_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify workspace membership & role
    const { data: member } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      console.warn(`[WhatsApp Manage] Access denied to workspace ${workspace_id} for user ${user.id}`)
      return new Response(JSON.stringify({ error: 'Access denied to this workspace' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log structured request metadata (never log access tokens or secrets)
    console.log('[WhatsApp Manage Request]', {
      action,
      workspace_id,
      user_id: user.id,
      role: member.role,
      phone_number_id: body.phone_number_id || null,
      graphApiVersion,
      timestamp: new Date().toISOString(),
    })

    // 1. CONNECT ACTION (Owner Only)
    if (action === 'connect') {
      if (member.role !== 'owner') {
        return new Response(JSON.stringify({ error: 'Only workspace owners can connect WhatsApp Cloud API' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { waba_id, phone_number_id, access_token, meta_business_id } = body
      if (!waba_id || !phone_number_id || !access_token) {
        return new Response(JSON.stringify({ error: 'Missing required credentials (waba_id, phone_number_id, access_token)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify credentials directly with Meta Graph API
      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        const errorPayload = logAndSanitizeMetaError('connect', metaRes.status, metaData)
        return new Response(JSON.stringify(errorPayload), {
          status: metaRes.status >= 400 && metaRes.status < 600 ? metaRes.status : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Save credentials via security definer RPC
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
      })

      if (rpcErr) {
        console.error('[WhatsApp Connect RPC Error]', rpcErr)
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('[WhatsApp Connection Successfully Saved]', { workspace_id, phone_number_id })
      return new Response(JSON.stringify(rpcRes), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. VERIFY ACTION (Owner / Manager)
    if (action === 'verify') {
      if (member.role !== 'owner' && member.role !== 'manager') {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: creds } = await supabaseAdmin.rpc('get_whatsapp_connection_credentials_internal', {
        p_workspace_id: workspace_id,
      })

      const connectionFound = Boolean(creds && creds.length > 0)
      const credentialFound = Boolean(creds?.[0]?.access_token)
      const tokenConfigured = Boolean(creds?.[0]?.access_token?.trim())

      console.log('[WhatsApp Credential Check]', { action, workspace_id, connectionFound, credentialFound, tokenConfigured })

      if (!connectionFound || !credentialFound) {
        return new Response(JSON.stringify({
          success: false,
          error: 'WhatsApp access credential was not found. Reconnect WhatsApp with a fresh token.',
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!tokenConfigured) {
        return new Response(JSON.stringify({
          success: false,
          error: 'WhatsApp access token is missing. Reconnect the integration.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { phone_number_id, access_token } = creds[0]

      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        const errorPayload = logAndSanitizeMetaError('verify', metaRes.status, metaData)

        await supabaseAdmin.from('whatsapp_connections').update({
          status: 'action_required',
          last_error: errorPayload.error,
          updated_at: new Date().toISOString(),
        }).eq('workspace_id', workspace_id)

        return new Response(JSON.stringify(errorPayload), {
          status: metaRes.status >= 400 && metaRes.status < 600 ? metaRes.status : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await supabaseAdmin.from('whatsapp_connections').update({
        status: 'connected',
        display_phone_number: metaData.display_phone_number || null,
        verified_name: metaData.verified_name || 'Verified Business',
        quality_rating: metaData.quality_rating || 'GREEN',
        messaging_limit_tier: metaData.messaging_limit_tier || 'TIER_50',
        last_verified_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', workspace_id)

      return new Response(JSON.stringify({ success: true, status: 'connected', meta: metaData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. STATUS ACTION (Workspace Members: Owner, Manager, Agent)
    if (action === 'status') {
      const { data: connection } = await supabaseAdmin
        .from('whatsapp_connections')
        .select('id, workspace_id, status, display_phone_number, verified_name, quality_rating, messaging_limit_tier, connected_at, last_verified_at, last_webhook_at, last_error')
        .eq('workspace_id', workspace_id)
        .single()

      return new Response(JSON.stringify({ connection }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. DISCONNECT ACTION (Owner Only)
    if (action === 'disconnect') {
      if (member.role !== 'owner') {
        return new Response(JSON.stringify({ error: 'Only workspace owners can disconnect WhatsApp Cloud API' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('disconnect_whatsapp_connection_rpc', {
        p_workspace_id: workspace_id,
      })

      if (rpcErr) {
        console.error('[WhatsApp Disconnect RPC Error]', rpcErr)
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(rpcRes), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. TEST MESSAGE ACTION (Owner / Manager)
    if (action === 'test-message') {
      if (member.role !== 'owner' && member.role !== 'manager') {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { recipient_phone, template_name, language_code } = body
      if (!recipient_phone) {
        return new Response(JSON.stringify({ error: 'Missing recipient_phone' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: creds, error: credErr } = await supabaseAdmin.rpc('get_whatsapp_connection_credentials_internal', {
        p_workspace_id: workspace_id,
      })

      const connectionFound = Boolean(creds && creds.length > 0)
      const credentialFound = Boolean(creds?.[0]?.access_token)
      const tokenConfigured = Boolean(creds?.[0]?.access_token?.trim())
      const phoneIdConfigured = Boolean(creds?.[0]?.phone_number_id?.trim())

      console.log('[WhatsApp Test Message Credential Check]', {
        action,
        workspace_id,
        connectionFound,
        credentialFound,
        tokenConfigured,
        phoneIdConfigured,
        rpcError: credErr ? credErr.message : null,
      })

      if (!connectionFound || !credentialFound) {
        return new Response(JSON.stringify({
          success: false,
          error: 'WhatsApp access credential was not found. Reconnect WhatsApp with a fresh token.',
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!tokenConfigured) {
        return new Response(JSON.stringify({
          success: false,
          error: 'WhatsApp access token is missing. Reconnect the integration.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { phone_number_id, access_token } = creds[0]
      const cleanPhone = recipient_phone.replace(/\D/g, '')

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: template_name || 'hello_world',
          language: { code: language_code || 'en_US' },
        },
      }

      console.log('[WhatsApp Test Message Sending]', {
        graphApiVersion,
        phone_number_id,
        cleanPhoneLength: cleanPhone.length,
        templateName: payload.template.name,
        languageCode: payload.template.language.code,
      })

      const metaRes = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const metaData = await metaRes.json()

      if (!metaRes.ok || metaData.error) {
        const errorPayload = logAndSanitizeMetaError('test-message', metaRes.status, metaData)
        return new Response(JSON.stringify(errorPayload), {
          status: metaRes.status >= 400 && metaRes.status < 600 ? metaRes.status : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const messageId = metaData.messages?.[0]?.id || 'unknown_msg_id'

      console.log('[WhatsApp Test Message Success]', { messageId, phone_number_id })

      return new Response(JSON.stringify({
        success: true,
        message_id: messageId,
        delivery_status: 'accepted',
        meta_response: metaData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Edge Function error'
    console.error('[WhatsApp Connection Manage Critical Error]', err)
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
