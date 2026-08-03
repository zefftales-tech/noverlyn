// ============================================================================
// SUPABASE EDGE FUNCTION: whatsapp-webhook
// Handles public Meta WhatsApp Cloud API webhooks:
// - GET: Challenge token verification (returns 200 plain text challenge or 403)
// - POST: Ingesting events with HMAC-SHA256 signature verification (x-hub-signature-256) & idempotency
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

    // Safe diagnostic logging (never log secret values)
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

  // 2. POST WEBHOOK EVENT INGESTION
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
        return new Response(JSON.stringify({ status: 'ignored', reason: 'No entries' }), {
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

          // Extract message or status event ID for idempotency
          const messages = (value.messages || []) as Array<Record<string, unknown>>
          const statuses = (value.statuses || []) as Array<Record<string, unknown>>
          const providerEventId = (messages[0]?.id || statuses[0]?.id || `event_${Date.now()}`) as string
          const eventType = messages.length > 0 ? 'inbound_message' : statuses.length > 0 ? 'status_update' : 'change_event'

          // Store event in database with idempotency (ignore duplicates)
          const { error: insertErr } = await supabaseAdmin
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

          if (!insertErr && connectionId) {
            // Update last_webhook_at timestamp on connection
            await supabaseAdmin
              .from('whatsapp_connections')
              .update({
                last_webhook_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', connectionId)
          }
        }
      }

      // Fast ACK to Meta (Must return 200 within 3 seconds)
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
