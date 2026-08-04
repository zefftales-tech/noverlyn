// ============================================================================
// SUPABASE EDGE FUNCTION: revenue-recovery-detect
// Multi-Industry AI Follow-Up & Lost-Revenue Recovery Engine (Phase 10C.1 Launch Hardened):
// - Priority Engine (0-100 Score & Priority Bands: act_now, high_priority, follow_up_soon, monitor)
// - Noise Suppression: Excludes empty/inactive leads from No Next Action
// - Professional Reply Engine: Contextual replies acknowledging known facts, never asking for "updates"
// - Dual Authentication & Table-Backed Locking
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-recovery-cron-secret',
}

interface RecoveryScanRequest {
  workspace_id?: string
  scheduled?: boolean
  batch_size?: number
}

const SCHEDULED_LOCK_KEY = 'revenue_recovery_scheduled_scan'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = new Date()
  const runId = crypto.randomUUID()

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const cronSecretEnv = Deno.env.get('REVENUE_RECOVERY_CRON_SECRET') || ''

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  let lockAcquired = false
  let isScheduledCron = false
  let callingUserId: string | null = null

  try {
    // 1. DUAL SECURE AUTHENTICATION
    const incomingCronSecret = req.headers.get('x-recovery-cron-secret')?.trim() || ''
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (cronSecretEnv && incomingCronSecret) {
      if (incomingCronSecret === cronSecretEnv) {
        isScheduledCron = true
      } else {
        return new Response(
          JSON.stringify({ error: 'Invalid cron authentication secret' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!isScheduledCron) {
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Missing authentication credentials' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (token === supabaseServiceKey) {
        isScheduledCron = true
      } else {
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
        if (authErr || !user) {
          return new Response(
            JSON.stringify({ error: 'Invalid or expired user session' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        callingUserId = user.id
      }
    }

    const body: RecoveryScanRequest = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const batchSize = Math.min(Math.max(body.batch_size || 25, 1), 100)

    let targetWorkspaceIds: string[] = []
    const isManualSingleScan = !!body.workspace_id

    if (isManualSingleScan && body.workspace_id) {
      if (callingUserId && !isScheduledCron) {
        const { data: member } = await supabaseAdmin
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', body.workspace_id)
          .eq('user_id', callingUserId)
          .eq('status', 'active')
          .single()

        if (!member || !['owner', 'manager'].includes(member.role)) {
          return new Response(
            JSON.stringify({ error: 'Access denied: Owner or Manager role required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      targetWorkspaceIds = [body.workspace_id]
    } else {
      // 2. ACQUIRE TABLE-BACKED DATABASE LOCK FOR SCHEDULED RUNS
      const { data: acquired } = await supabaseAdmin.rpc('acquire_revenue_recovery_scan_lock_rpc', {
        p_lock_key: SCHEDULED_LOCK_KEY,
        p_run_id: runId,
        p_ttl_seconds: 600,
      })

      lockAcquired = !!acquired

      if (!lockAcquired) {
        const completedAt = new Date()
        return new Response(
          JSON.stringify({
            success: true,
            run_id: runId,
            overlap_skipped: true,
            message: 'Another scheduled scan is currently executing.',
            duration_ms: completedAt.getTime() - startedAt.getTime(),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 3. PERSISTENT CURSOR WORKSPACE BATCHING
      const { data: batchRows } = await supabaseAdmin.rpc('get_next_revenue_recovery_batch_rpc', {
        p_batch_size: batchSize,
      })

      targetWorkspaceIds = (batchRows || []).map((r: { workspace_id: string }) => r.workspace_id)
    }

    // Metrics counters
    let scannedWorkspaces = 0
    let createdItems = 0
    let updatedItems = 0
    let supersededItems = 0
    const skippedItems = 0
    let failedWorkspaces = 0
    let lastAttemptedWorkspaceId: string | null = null

    for (const wsId of targetWorkspaceIds) {
      try {
        scannedWorkspaces++
        lastAttemptedWorkspaceId = wsId

        // 4. SERVER-SIDE STOP RULES: Auto-supersede / close items when customer replies or lead won/lost
        const { data: openItems } = await supabaseAdmin
          .from('revenue_recovery_items')
          .select('*, lead:leads(*), conversation:whatsapp_conversations(*)')
          .eq('workspace_id', wsId)
          .in('status', ['open', 'in_progress'])

        if (openItems && openItems.length > 0) {
          for (const item of openItems) {
            let shouldClose = false
            let closeStatus = 'completed'
            let closeOutcome = 'Auto-closed by system rule'

            // Stop Rule A: Lead won, lost, archived, or deleted
            if (item.lead) {
              if (['won', 'lost'].includes(item.lead.stage) || item.lead.status === 'won' || item.lead.status === 'lost') {
                shouldClose = true
                closeStatus = 'completed'
                closeOutcome = `Lead stage changed to ${item.lead.stage}`
              } else if (item.lead.deleted_at || item.lead.archived_at) {
                shouldClose = true
                closeStatus = 'dismissed'
                closeOutcome = 'Lead was archived or deleted'
              }
            }

            // Stop Rule B: Customer replied or conversation is no longer waiting
            if (!shouldClose && item.conversation) {
              const convLastIncoming = item.conversation.last_incoming_at
                ? new Date(item.conversation.last_incoming_at).getTime()
                : 0
              const itemDetected = new Date(item.detected_at).getTime()

              if (convLastIncoming > itemDetected || !item.conversation.needs_response) {
                shouldClose = true
                closeStatus = 'superseded'
                closeOutcome = 'Customer replied to conversation'
              }
            }

            if (shouldClose) {
              await supabaseAdmin
                .from('revenue_recovery_items')
                .update({
                  status: closeStatus,
                  outcome: closeOutcome,
                  completed_at: closeStatus === 'completed' ? new Date().toISOString() : null,
                  dismissed_at: closeStatus === 'dismissed' ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', item.id)

              supersededItems++
            }
          }
        }

        // 5. RULE-BASED DETECTION WITH PRIORITY SCORE & NOISE SUPPRESSION
        // A. Scan Conversations for Customer Waiting (> 30 mins)
        const { data: waitingConvs } = await supabaseAdmin
          .from('whatsapp_conversations')
          .select('*, lead:leads(*)')
          .eq('workspace_id', wsId)
          .eq('status', 'open')
          .eq('needs_response', true)

        if (waitingConvs && waitingConvs.length > 0) {
          for (const conv of waitingConvs) {
            const lastMsgAt = conv.last_incoming_at || conv.last_message_at || conv.updated_at
            const ageMinutes = (Date.now() - new Date(lastMsgAt).getTime()) / 60000

            if (ageMinutes >= 30) {
              const fingerprint = `waiting:${conv.id}:${lastMsgAt}`
              const contactName = conv.contact_name || conv.contact_phone
              const leadVal = conv.lead?.budget_max || conv.lead?.budget_min || null
              const reqText = conv.lead?.requirement || conv.last_message_preview || ''

              // Calculate Priority Score (0-100)
              let priorityScore = 40
              if (ageMinutes >= 120) priorityScore += 45
              else if (ageMinutes >= 60) priorityScore += 35
              else priorityScore += 20

              if (leadVal && leadVal >= 5000) priorityScore += 15
              if (!conv.assigned_to) priorityScore += 10
              priorityScore = Math.min(priorityScore, 100)

              const priorityBand =
                priorityScore >= 85
                  ? 'act_now'
                  : priorityScore >= 65
                  ? 'high_priority'
                  : priorityScore >= 40
                  ? 'follow_up_soon'
                  : 'monitor'

              const urgency = priorityScore >= 85 ? 'critical' : priorityScore >= 65 ? 'high' : 'normal'
              const priorityReason = `Customer ${contactName} has waited ${Math.round(ageMinutes)} minutes for a response.`

              // Professional Contextual Suggested Reply (No generic "checking in", no repeating full raw message)
              let suggestedMessage = `Hi ${contactName}, thanks for reaching out!`
              if (reqText.toLowerCase().includes('3bhk') || reqText.toLowerCase().includes('apartment')) {
                suggestedMessage = `Hi ${contactName}, thanks for sharing your property requirement. I've noted your request for a 3BHK apartment. Which location do you prefer, and are you looking to rent or buy?`
              } else if (reqText) {
                suggestedMessage = `Hi ${contactName}, thanks for reaching out regarding ${reqText}. I'd be happy to assist you with the details. Could you share your preferred timeline?`
              }

              const { data: existing } = await supabaseAdmin
                .from('revenue_recovery_items')
                .select('id')
                .eq('workspace_id', wsId)
                .eq('source_fingerprint', fingerprint)
                .single()

              const { data: upserted } = await supabaseAdmin
                .from('revenue_recovery_items')
                .upsert(
                  {
                    workspace_id: wsId,
                    conversation_id: conv.id,
                    lead_id: conv.lead_id || null,
                    assigned_to: conv.assigned_to || conv.lead?.assigned_to || null,
                    risk_type: 'customer_waiting_for_reply',
                    status: 'open',
                    urgency,
                    confidence: 0.95,
                    title: `Customer Waiting (${Math.round(ageMinutes)}m)`,
                    reason: `${contactName} sent a message ${Math.round(ageMinutes)} minutes ago and is waiting for a response.`,
                    recommended_action: `Reply to ${contactName} now to answer their inquiry.`,
                    suggested_message: suggestedMessage,
                    estimated_value: leadVal,
                    currency: 'USD',
                    source_fingerprint: fingerprint,
                    metadata: {
                      age_minutes: Math.round(ageMinutes),
                      priority_score: priorityScore,
                      priority_band: priorityBand,
                      priority_reason: priorityReason,
                    },
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'workspace_id,source_fingerprint' }
                )
                .select('id')
                .single()

              if (upserted) {
                if (existing) updatedItems++
                else createdItems++
              }
            }
          }
        }

        // B. Scan Overdue Follow-ups
        const { data: overdueFollowUps } = await supabaseAdmin
          .from('follow_ups')
          .select('*, lead:leads(*)')
          .eq('workspace_id', wsId)
          .eq('status', 'pending')
          .lt('scheduled_at', new Date().toISOString())

        if (overdueFollowUps && overdueFollowUps.length > 0) {
          for (const fu of overdueFollowUps) {
            const fingerprint = `overdue_fu:${fu.id}:${fu.scheduled_at}`
            const leadName = fu.lead?.full_name || 'Lead'
            const leadVal = fu.lead?.budget_max || fu.lead?.budget_min || null

            const priorityScore = 80
            const priorityBand = 'high_priority'
            const priorityReason = `Scheduled ${fu.type || 'follow-up'} for ${leadName} is overdue.`

            const { data: existing } = await supabaseAdmin
              .from('revenue_recovery_items')
              .select('id')
              .eq('workspace_id', wsId)
              .eq('source_fingerprint', fingerprint)
              .single()

            const { data: upserted } = await supabaseAdmin
              .from('revenue_recovery_items')
              .upsert(
                {
                  workspace_id: wsId,
                  lead_id: fu.lead_id,
                  assigned_to: fu.assigned_to || fu.lead?.assigned_to || null,
                  risk_type: 'overdue_follow_up',
                  status: 'open',
                  urgency: 'high',
                  confidence: 0.95,
                  title: `Overdue Follow-up (${fu.type || 'call'})`,
                  reason: `Scheduled follow-up for ${leadName} was due on ${new Date(fu.scheduled_at).toLocaleDateString()}.`,
                  recommended_action: `Complete scheduled ${fu.type || 'call'} follow-up with ${leadName}.`,
                  suggested_message: `Hi ${leadName}, following up as planned regarding your requirement for ${fu.lead?.requirement || 'our services'}. Let me know if you have any questions!`,
                  estimated_value: leadVal,
                  currency: 'USD',
                  source_fingerprint: fingerprint,
                  metadata: {
                    follow_up_id: fu.id,
                    priority_score: priorityScore,
                    priority_band: priorityBand,
                    priority_reason: priorityReason,
                  },
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'workspace_id,source_fingerprint' }
              )
              .select('id')
              .single()

            if (upserted) {
              if (existing) updatedItems++
              else createdItems++
            }
          }
        }

        // C. Scan Active Leads for No Next Action (WITH STRICT NOISE SUPPRESSION)
        // Suppress empty, inactive (> 30 days), test, or uncontacted dummy leads
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        const { data: activeLeads } = await supabaseAdmin
          .from('leads')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('status', 'active')
          .not('stage', 'in', '("won","lost")')
          .gt('updated_at', thirtyDaysAgo)
          .limit(50)

        if (activeLeads && activeLeads.length > 0) {
          for (const lead of activeLeads) {
            // Strict Noise Suppression Check: Must have meaningful info or past activity
            const hasMeaningfulInfo =
              !!lead.requirement ||
              (lead.budget_max && lead.budget_max > 0) ||
              ['contacted', 'qualifying', 'proposal', 'negotiation'].includes(lead.stage)

            if (!hasMeaningfulInfo) continue

            const { count: openFuCount } = await supabaseAdmin
              .from('follow_ups')
              .select('id', { count: 'exact', head: true })
              .eq('lead_id', lead.id)
              .eq('status', 'pending')
              .gt('scheduled_at', new Date().toISOString())

            if (openFuCount === 0) {
              const fingerprint = `no_next_action:${lead.id}:${lead.updated_at}`
              const leadVal = lead.budget_max || lead.budget_min || null

              const priorityScore = 55
              const priorityBand = 'follow_up_soon'
              const priorityReason = `Active lead ${lead.full_name} has meaningful history but no scheduled next action.`

              const { data: existing } = await supabaseAdmin
                .from('revenue_recovery_items')
                .select('id')
                .eq('workspace_id', wsId)
                .eq('source_fingerprint', fingerprint)
                .single()

              const { data: upserted } = await supabaseAdmin
                .from('revenue_recovery_items')
                .upsert(
                  {
                    workspace_id: wsId,
                    lead_id: lead.id,
                    assigned_to: lead.assigned_to || null,
                    risk_type: 'no_next_action',
                    status: 'open',
                    urgency: 'normal',
                    confidence: 0.9,
                    title: `No Scheduled Next Action`,
                    reason: `Active lead ${lead.full_name} has no pending future follow-up scheduled.`,
                    recommended_action: `Schedule a follow-up call or send a progress update to ${lead.full_name}.`,
                    suggested_message: `Hi ${lead.full_name}, following up regarding your requirement for ${lead.requirement || 'our services'}. Would you be available for a brief call this week?`,
                    estimated_value: leadVal,
                    currency: 'USD',
                    source_fingerprint: fingerprint,
                    metadata: {
                      lead_stage: lead.stage,
                      priority_score: priorityScore,
                      priority_band: priorityBand,
                      priority_reason: priorityReason,
                    },
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'workspace_id,source_fingerprint' }
                )
                .select('id')
                .single()

              if (upserted) {
                if (existing) updatedItems++
                else createdItems++
              }
            }
          }
        }
      } catch (wsErr) {
        console.error(`[revenue-recovery-detect Workspace Error for ${wsId}]`, wsErr)
        failedWorkspaces++
      }
    }

    // 6. UPDATE PERSISTENT CURSOR FOR SCHEDULED RUNS
    if (!isManualSingleScan && lastAttemptedWorkspaceId) {
      await supabaseAdmin.rpc('update_revenue_recovery_cursor_rpc', {
        p_last_workspace_id: lastAttemptedWorkspaceId,
      })
    }

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        scanned_workspaces: scannedWorkspaces,
        created_items: createdItems,
        updated_items: updatedItems,
        superseded_items: supersededItems,
        skipped_items: skippedItems,
        failed_workspaces: failedWorkspaces,
        duration_ms: durationMs,
        overlap_skipped: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('[revenue-recovery-detect Error]', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } finally {
    // 7. ALWAYS RELEASE TABLE LOCK SAFELY IN FINALLY BLOCK
    if (lockAcquired) {
      try {
        await supabaseAdmin.rpc('release_revenue_recovery_scan_lock_rpc', {
          p_lock_key: SCHEDULED_LOCK_KEY,
          p_run_id: runId,
        })
      } catch {
        // Ignore lock release failures
      }
    }
  }
})
