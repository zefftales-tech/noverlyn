import { supabase, isSupabaseConfigured, getValidAccessToken } from './supabase'

export interface RevenueRecoveryItem {
  id: string
  workspace_id: string
  lead_id: string | null
  conversation_id: string | null
  assigned_to: string | null
  risk_type:
    | 'unanswered_customer_message'
    | 'customer_waiting_for_reply'
    | 'overdue_follow_up'
    | 'no_next_action'
    | 'quote_or_proposal_no_response'
    | 'strong_buying_signal_no_action'
    | 'unresolved_objection'
    | 'agent_promise_not_completed'
    | 'high_intent_lead_inactive'
    | 'pipeline_stage_stagnation'
    | 'conversation_resolved_without_next_step'
    | 'unassigned_high_value_lead'
    | 'repeated_customer_follow_up'
    | 'missed_appointment_or_call'
    | 'lead_inactivity_risk'
  status: 'open' | 'in_progress' | 'snoozed' | 'completed' | 'dismissed' | 'superseded'
  urgency: 'critical' | 'high' | 'normal' | 'low'
  confidence: number
  title: string
  reason: string
  recommended_action: string
  recommended_at: string | null
  suggested_message: string | null
  evidence: Array<{ message_id?: string; text?: string; timestamp?: string }>
  estimated_value: number | null
  currency: string | null
  source_fingerprint: string
  detected_at: string
  snoozed_until: string | null
  completed_at: string | null
  completed_by: string | null
  dismissed_at: string | null
  dismissed_by: string | null
  outcome: string | null
  metadata: {
    priority_score?: number
    priority_band?: 'act_now' | 'high_priority' | 'follow_up_soon' | 'monitor'
    priority_reason?: string
    age_minutes?: number
    lead_stage?: string
    follow_up_id?: string
    [key: string]: unknown
  }
  created_at: string
  updated_at: string
  lead?: {
    id: string
    full_name: string
    phone: string
    requirement?: string | null
    stage?: string
    priority?: string
  } | null
  conversation?: {
    id: string
    contact_phone: string
    contact_name: string | null
    last_message_preview: string | null
  } | null
}

export interface GroupedRecoveryCard {
  group_key: string
  customer_name: string
  contact_phone: string | null
  primary_item: RevenueRecoveryItem
  all_items: RevenueRecoveryItem[]
  highest_priority_score: number
  priority_band: 'act_now' | 'high_priority' | 'follow_up_soon' | 'monitor'
  priority_reason: string
  estimated_value: number | null
  has_possible_duplicates: boolean
}

export const revenueRecoveryApi = {
  // Fetch Workspace Recovery Items
  getRecoveryItems: async (
    workspaceId: string,
    filter?: { status?: string; urgency?: string; risk_type?: string }
  ): Promise<RevenueRecoveryItem[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    let query = supabase
      .from('revenue_recovery_items' as never)
      .select('*, lead:leads(id, full_name, phone, requirement, stage, priority), conversation:whatsapp_conversations(id, contact_phone, contact_name, last_message_preview)')
      .eq('workspace_id', workspaceId)
      .order('detected_at', { ascending: false })

    if (filter?.status) {
      query = query.eq('status', filter.status)
    } else {
      query = query.in('status', ['open', 'in_progress', 'snoozed'])
    }

    if (filter?.urgency) {
      query = query.eq('urgency', filter.urgency)
    }

    if (filter?.risk_type) {
      query = query.eq('risk_type', filter.risk_type)
    }

    const { data, error } = await query

    if (error) {
      console.error('[revenueRecoveryApi.getRecoveryItems failed]', error)
      return []
    }

    return (data || []) as unknown as RevenueRecoveryItem[]
  },

  // Group Raw Items into One Card Per Customer/Lead
  groupItemsByCustomer: (rawItems: RevenueRecoveryItem[]): GroupedRecoveryCard[] => {
    const map = new Map<string, RevenueRecoveryItem[]>()

    rawItems.forEach((item) => {
      const key = item.lead_id || item.conversation_id || item.conversation?.contact_phone || item.id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    })

    const grouped: GroupedRecoveryCard[] = []

    map.forEach((items, key) => {
      // Sort items by priority score descending
      items.sort((a, b) => {
        const scoreA = a.metadata?.priority_score || (a.urgency === 'critical' ? 90 : a.urgency === 'high' ? 75 : 50)
        const scoreB = b.metadata?.priority_score || (b.urgency === 'critical' ? 90 : b.urgency === 'high' ? 75 : 50)
        return scoreB - scoreA
      })

      const primary = items[0]
      const highestScore = primary.metadata?.priority_score || (primary.urgency === 'critical' ? 90 : primary.urgency === 'high' ? 75 : 50)

      const band: 'act_now' | 'high_priority' | 'follow_up_soon' | 'monitor' =
        primary.metadata?.priority_band ||
        (highestScore >= 85 ? 'act_now' : highestScore >= 65 ? 'high_priority' : highestScore >= 40 ? 'follow_up_soon' : 'monitor')

      const custName = primary.lead?.full_name || primary.conversation?.contact_name || primary.conversation?.contact_phone || 'Customer'
      const phone = primary.lead?.phone || primary.conversation?.contact_phone || null
      const maxVal = Math.max(...items.map((i) => i.estimated_value || 0))

      grouped.push({
        group_key: key,
        customer_name: custName,
        contact_phone: phone,
        primary_item: primary,
        all_items: items,
        highest_priority_score: highestScore,
        priority_band: band,
        priority_reason: primary.metadata?.priority_reason || primary.reason,
        estimated_value: maxVal > 0 ? maxVal : null,
        has_possible_duplicates: false,
      })
    })

    // Sort grouped cards by priority score descending
    return grouped.sort((a, b) => b.highest_priority_score - a.highest_priority_score)
  },

  // Trigger Recovery Scan Edge Function
  runScan: async (workspaceId: string): Promise<{ detected_items_count: number }> => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

    const token = await getValidAccessToken()
    const { data, error } = await supabase.functions.invoke('revenue-recovery-detect', {
      body: { workspace_id: workspaceId },
      headers: { Authorization: `Bearer ${token}` },
    })

    if (error) {
      console.error('[revenueRecoveryApi.runScan failed]', error)
      throw error
    }

    return data as unknown as { detected_items_count: number }
  },

  // Complete Item
  completeItem: async (itemId: string, outcome?: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('complete_recovery_item_rpc' as never, {
      p_item_id: itemId,
      p_outcome: outcome || 'Resolved by user action',
    } as never)

    if (error) {
      console.error('[revenueRecoveryApi.completeItem failed]', error)
      return false
    }

    return true
  },

  // Snooze Item
  snoozeItem: async (itemId: string, snoozeUntil?: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('snooze_recovery_item_rpc' as never, {
      p_item_id: itemId,
      p_snooze_until: snoozeUntil || null,
    } as never)

    if (error) {
      console.error('[revenueRecoveryApi.snoozeItem failed]', error)
      return false
    }

    return true
  },

  // Dismiss Item
  dismissItem: async (itemId: string, reason?: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('dismiss_recovery_item_rpc' as never, {
      p_item_id: itemId,
      p_reason: reason || 'Dismissed by user',
    } as never)

    if (error) {
      console.error('[revenueRecoveryApi.dismissItem failed]', error)
      return false
    }

    return true
  },

  // Assign Item
  assignItem: async (itemId: string, assignedTo: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('assign_recovery_item_rpc' as never, {
      p_item_id: itemId,
      p_assigned_to: assignedTo,
    } as never)

    if (error) {
      console.error('[revenueRecoveryApi.assignItem failed]', error)
      return false
    }

    return true
  },
}
