// Supabase Edge Function: notification-digest-dispatch
// Handles hourly follow-up reminder dispatch and daily morning digests

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-noverlyn-cron-secret',
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Cron Secret Authorization Check
    const cronSecret = Deno.env.get('NOVERLYN_CRON_SECRET') || ''
    const providedSecret = req.headers.get('x-noverlyn-cron-secret') || ''

    if (!cronSecret || !providedSecret || !timingSafeEqual(providedSecret, cronSecret)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid or missing cron secret' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Fetch all active workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, timezone')

    if (wsError) throw wsError

    let totalReminders = 0
    let totalDigests = 0
    let processedCount = 0

    // 3. Iterate workspaces safely with per-workspace error boundaries
    for (const ws of workspaces || []) {
      try {
        // Trigger due/overdue reminders
        const { data: remCount, error: remErr } = await supabase.rpc(
          'generate_due_and_overdue_notifications',
          { p_workspace_id: ws.id }
        )

        if (!remErr && typeof remCount === 'number') {
          totalReminders += remCount
        }

        // Check if local time in workspace's IANA timezone falls in morning 8:00 AM - 8:59 AM window
        const localTimeStr = new Date().toLocaleTimeString('en-US', {
          timeZone: ws.timezone || 'UTC',
          hour12: false,
          hour: '2-digit',
        })
        const currentHour = parseInt(localTimeStr, 10)

        if (currentHour === 8) {
          const { data: digestCount, error: digestErr } = await supabase.rpc(
            'generate_daily_digest_for_workspace',
            { p_workspace_id: ws.id }
          )

          if (!digestErr && typeof digestCount === 'number') {
            totalDigests += digestCount
          }
        }
        processedCount++
      } catch (wsErr) {
        console.error(`Error processing workspace ${ws.id}:`, wsErr)
        // Continue to next workspace
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspacesProcessed: processedCount,
        remindersDispatched: totalReminders,
        digestsDispatched: totalDigests,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
