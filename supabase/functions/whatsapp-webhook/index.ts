// ============================================================================
// SUPABASE EDGE FUNCTION: whatsapp-webhook
// Handles public Meta WhatsApp Cloud API webhooks:
// - GET: Challenge token verification (returns 200 plain text challenge or 403)
// - POST: Ingesting events with HMAC-SHA256 signature verification (x-hub-signature-256),
//         idempotency, error handling, status tracking, and triggering database RPC inbox processing.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

serve(async (req) => {
  const url = new URL(req.url)

  // 1. GET VERIFICATION REQUEST (Meta Webhook Verification)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const receivedToken = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const expectedToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')?.trim()

    console.log('[WhatsApp Webhook GET Verification Request]', {
      method: req.method,
      mode,
      expectedTokenConfigured: Boolean(expectedToken),
      receivedTokenLength: receivedToken?.length ?? 0,
      expectedTokenLength: expectedToken?.length ?? 0,
      challengePresent: Boolean(challenge),
      tokenMatches: receivedToken?.trim() === expectedToken,
    })

    if (
      mode === 'subscribe' &&
      receivedToken?.trim() === expectedToken &&
      challenge
    ) {
      return new Response(challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    }

    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }

  // 2. POST WEBHOOK EVENT INGESTION & PROCESSING
  if (req.method === 'POST') {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const appSecret = Deno.env.get('META_APP_SECRET')?.trim()
      const signatureHeader = req.headers.get('x-hub-signature-256')

      // Read exact raw request body BEFORE any JSON parsing for HMAC SHA-256 verification
      const rawBody = await req.text()

      // Enforce HMAC SHA-256 signature verification if META_APP_SECRET is configured
      if (appSecret) {
        if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
          return new Response(JSON.stringify({ error: 'Missing or invalid signature header format' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const expectedSignatureHex = signatureHeader.slice(7)
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(appSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        )
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
        const computedHex = Array.from(new Uint8Array(signatureBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

        if (computedHex !== expectedSignatureHex) {
          return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(rawBody)
      } catch {
        return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

      // Extract entries & phone number ID
      const entries = (payload.entry || []) as Array<Record<string, unknown>>
      if (entries.length === 0) {
        return new Response(JSON.stringify({ status: 'received', reason: 'no_entries' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      for (const entry of entries) {
        const changes = (entry.changes || []) as Array<Record<string, unknown>>
        for (const change of changes) {
          const value = (change.value || {}) as Record<string, unknown>
          const metadata = (value.metadata || {}) as Record<string, unknown>
          const phoneNumberId = metadata.phone_number_id as string | undefined

          if (!phoneNumberId) continue

          // Resolve connection record for this phone_number_id
          const { data: connection } = await supabaseAdmin
            .from('whatsapp_connections')
            .select('id, workspace_id')
            .eq('phone_number_id', phoneNumberId)
            .eq('status', 'connected')
            .single()

          const workspaceId = connection?.workspace_id || null
          const connectionId = connection?.id || null

          const contacts = (value.contacts || []) as Array<Record<string, unknown>>
          const messages = (value.messages || []) as Array<Record<string, unknown>>
          const statuses = (value.statuses || []) as Array<Record<string, unknown>>
          const providerEventId = (messages[0]?.id || statuses[0]?.id || `event_${Date.now()}`) as string
          const eventType = messages.length > 0 ? 'inbound_message' : statuses.length > 0 ? 'status_update' : 'change_event'

          // Store event in database with initial status
          const { data: eventRecord, error: insertErr } = await supabaseAdmin
            .from('whatsapp_webhook_events')
            .insert({
              workspace_id: workspaceId,
              connection_id: connectionId,
              provider_event_id: providerEventId,
              event_type: eventType,
              payload: change,
              processing_status: connectionId ? 'received' : 'ignored',
              processing_error: connectionId ? null : 'Unknown phone_number_id',
              received_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (!insertErr && connectionId && workspaceId && eventRecord?.id) {
            // Update last_webhook_at timestamp on connection
            await supabaseAdmin
              .from('whatsapp_connections')
              .update({
                last_webhook_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', connectionId)

            let processingFailed = false
            let lastErrorMessage: string | null = null

            // A. PROCESS INBOUND MESSAGES
            for (const msg of messages) {
              try {
                const fromPhone = (msg.from || '') as string
                const msgId = (msg.id || '') as string
                const msgType = (msg.type || 'text') as string
                const textObj = (msg.text || {}) as Record<string, unknown>
                const textBody = (textObj.body || null) as string | null
                const imageObj = (msg.image || {}) as Record<string, unknown>
                const docObj = (msg.document || {}) as Record<string, unknown>
                const audioObj = (msg.audio || {}) as Record<string, unknown>
                const videoObj = (msg.video || {}) as Record<string, unknown>

                const mediaId = (imageObj.id || docObj.id || audioObj.id || videoObj.id || null) as string | null
                const mediaMime = (imageObj.mime_type || docObj.mime_type || audioObj.mime_type || videoObj.mime_type || null) as string | null
                const mediaFilename = (docObj.filename || null) as string | null
                const mediaCaption = (imageObj.caption || docObj.caption || videoObj.caption || null) as string | null

                const senderName = (contacts[0]?.profile as Record<string, unknown> | undefined)?.name as string | undefined || fromPhone

                const tsNum = Number(msg.timestamp) || Math.floor(Date.now() / 1000)
                const occurredAt = new Date(tsNum * 1000).toISOString()

                const { error: rpcErr } = await supabaseAdmin.rpc('process_inbound_whatsapp_message_rpc', {
                  p_workspace_id: workspaceId,
                  p_connection_id: connectionId,
                  p_sender_phone: fromPhone,
                  p_sender_name: senderName,
                  p_meta_message_id: msgId,
                  p_message_type: msgType,
                  p_text_body: textBody,
                  p_media_id: mediaId,
                  p_media_mime: mediaMime,
                  p_media_filename: mediaFilename,
                  p_media_caption: mediaCaption,
                  p_timestamp: occurredAt,
                  p_raw_metadata: msg,
                })

                if (rpcErr) {
                  processingFailed = true
                  lastErrorMessage = rpcErr.message
                }
              } catch (mErr: unknown) {
                processingFailed = true
                lastErrorMessage = mErr instanceof Error ? mErr.message : 'Unknown inbound error'
              }
            }

            // B. PROCESS MESSAGE STATUS UPDATES
            for (const st of statuses) {
              try {
                const statusMsgId = (st.id || '') as string
                const statusType = (st.status || 'sent') as string
                const tsNum = Number(st.timestamp) || Math.floor(Date.now() / 1000)
                const statusAt = new Date(tsNum * 1000).toISOString()
                const errors = (st.errors || []) as Array<Record<string, unknown>>
                const errCode = errors[0]?.code ? String(errors[0]?.code) : null
                const errTitle = errors[0]?.title ? String(errors[0]?.title) : null

                const { error: rpcErr } = await supabaseAdmin.rpc('process_whatsapp_status_update_rpc', {
                  p_workspace_id: workspaceId,
                  p_meta_message_id: statusMsgId,
                  p_status: statusType,
                  p_timestamp: statusAt,
                  p_error_code: errCode,
                  p_error_message: errTitle,
                })

                if (rpcErr) {
                  processingFailed = true
                  lastErrorMessage = rpcErr.message
                }
              } catch (stErr: unknown) {
                processingFailed = true
                lastErrorMessage = stErr instanceof Error ? stErr.message : 'Unknown status error'
              }
            }

            // Update event final processing status
            await supabaseAdmin
              .from('whatsapp_webhook_events')
              .update({
                processing_status: processingFailed ? 'failed' : 'processed',
                processed_at: new Date().toISOString(),
                processing_error: lastErrorMessage,
              })
              .eq('id', eventRecord.id)
          }
        }
      }

      // Fast ACK to Meta (Always return HTTP 200 to valid Meta webhooks)
      return new Response(JSON.stringify({ status: 'received' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err: unknown) {
      console.error('[WhatsApp Webhook Ingestion Error]', err)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response('Method Not Allowed', { status: 405 })
})
