import { supabase } from './supabase'

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'NORMAL'
export type IssueType =
  | 'overdue_follow_up'
  | 'due_today'
  | 'new_lead_waiting'
  | 'hot_lead_inactive'
  | 'negotiation_no_action'
  | 'unassigned_lead'
  | 'high_value_at_risk'

export interface SecondaryIssue {
  type: IssueType
  label: string
}

export interface AttentionItem {
  lead_id: string
  workspace_id: string
  assigned_to: string | null
  lead_name: string
  phone: string
  email: string | null
  source: string | null
  requirement: string | null
  priority: 'hot' | 'warm' | 'cold'
  stage: string
  status: string
  estimated_value: number | null
  budget_min: number | null
  budget_max: number | null
  created_at: string
  last_activity_at: string | null
  last_contacted_at: string | null
  next_follow_up_at: string | null
  urgency_level: UrgencyLevel
  primary_issue: IssueType
  primary_issue_label: string
  primary_issue_detail: string
  issue_timestamp: string | null
  secondary_issues: SecondaryIssue[]
  next_action: string
  sort_score: number
}

// Fetch canonical attention items from SQL RPC
export async function fetchWorkspaceAttentionItems(
  workspaceId: string,
  agentId?: string
): Promise<AttentionItem[]> {
  if (!supabase) throw new Error('Supabase client uninitialized')

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>)('get_workspace_attention_items', {
    p_workspace_id: workspaceId,
    p_agent_id: agentId || null,
  })

  if (error) {
    console.error('Error fetching attention items:', error)
    throw error
  }

  const items = (data || []) as AttentionItem[]
  // Sort by sort_score descending
  return items.sort((a, b) => b.sort_score - a.sort_score)
}

// Presentation Helpers (UI badges, icons, colors)
export function getUrgencyBadgeVariant(urgency: UrgencyLevel): 'critical' | 'warning' | 'blue' | 'neutral' {
  switch (urgency) {
    case 'CRITICAL':
      return 'critical'
    case 'HIGH':
      return 'warning'
    case 'NORMAL':
      return 'blue'
    default:
      return 'neutral'
  }
}

export function getIssueBadgeVariant(issueType: IssueType): 'critical' | 'warning' | 'blue' | 'neutral' {
  switch (issueType) {
    case 'overdue_follow_up':
    case 'high_value_at_risk':
      return 'critical'
    case 'hot_lead_inactive':
    case 'new_lead_waiting':
    case 'negotiation_no_action':
      return 'warning'
    case 'due_today':
      return 'blue'
    default:
      return 'neutral'
  }
}
