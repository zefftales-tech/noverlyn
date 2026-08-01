import { supabase } from './supabase'
import type { Database, LeadStage, LeadPriority, LeadStatus, LostReason, FollowUpType, WorkspaceRole } from '../types/database.types'

type Lead = Database['public']['Tables']['leads']['Row']
type FollowUp = Database['public']['Tables']['follow_ups']['Row']
type Activity = Database['public']['Tables']['activities']['Row']
type LeadNote = Database['public']['Tables']['lead_notes']['Row']

export interface CreateLeadParams {
  workspace_id: string
  full_name: string
  phone: string
  email?: string
  source?: string
  requirement?: string
  budget_min?: number
  budget_max?: number
  estimated_value?: number
  priority?: LeadPriority
  stage?: LeadStage
  assigned_to?: string
  initial_note?: string
  follow_up_scheduled_at?: string
  follow_up_type?: FollowUpType
  follow_up_notes?: string
}

export interface UpdateLeadParams {
  lead_id: string
  full_name: string
  phone: string
  email?: string
  source?: string
  requirement?: string
  budget_min?: number
  budget_max?: number
  estimated_value?: number
  priority?: LeadPriority
  assigned_to?: string
}

export interface LogContactParams {
  lead_id: string
  contact_method: string
  outcome?: string
  notes?: string
  follow_up_scheduled_at?: string
  follow_up_type?: FollowUpType
  follow_up_notes?: string
}

export interface ScheduleFollowUpParams {
  lead_id: string
  scheduled_at: string
  type?: FollowUpType
  assigned_to?: string
  notes?: string
}

import { getTemplateForBusinessType } from './templates'

export interface PipelineStage {
  id: string
  stage_key: string
  label: string
  position: number
  is_won: boolean
  is_lost: boolean
  requires_next_action: boolean
}

export interface ImportLeadItem {
  full_name: string
  phone?: string
  email?: string
  source?: string
  priority?: string
  stage?: string
  budget_min?: number
  budget_max?: number
  estimated_value?: number
  requirement?: string
  notes?: string
  assigned_agent_email?: string
}

export interface ImportLeadsResult {
  imported: number
  skipped: number
  failed: number
  errors?: Array<{
    row: number
    name: string
    reason: string
  }>
}

export interface BulkUpdateParams {
  assigned_to?: string
  priority?: LeadPriority
  stage?: LeadStage
  status?: LeadStatus
}

export interface GetLeadsOptions {
  page?: number
  pageSize?: number
  searchQuery?: string
  stageFilter?: LeadStage | 'all'
  priorityFilter?: LeadPriority | 'all'
  statusFilter?: LeadStatus | 'all'
}

// Call RPC helper safely
async function callRpc<T>(fnName: string, params: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase client is not initialized')
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>)(fnName, params)

  if (error) throw error
  return data as T
}

export const leadsApi = {
  // 1. Create Lead
  createLead: async (params: CreateLeadParams): Promise<Lead> => {
    return callRpc<Lead>('create_lead_rpc', {
      p_workspace_id: params.workspace_id,
      p_full_name: params.full_name,
      p_phone: params.phone,
      p_email: params.email || null,
      p_source: params.source || null,
      p_requirement: params.requirement || null,
      p_budget_min: params.budget_min ?? null,
      p_budget_max: params.budget_max ?? null,
      p_estimated_value: params.estimated_value ?? null,
      p_priority: params.priority || 'warm',
      p_stage: params.stage || 'new',
      p_assigned_to: params.assigned_to || null,
      p_initial_note: params.initial_note || null,
      p_follow_up_scheduled_at: params.follow_up_scheduled_at || null,
      p_follow_up_type: params.follow_up_type || null,
      p_follow_up_notes: params.follow_up_notes || null,
    })
  },

  // 2. Update Lead
  updateLead: async (params: UpdateLeadParams): Promise<Lead> => {
    return callRpc<Lead>('update_lead_rpc', {
      p_lead_id: params.lead_id,
      p_full_name: params.full_name,
      p_phone: params.phone,
      p_email: params.email || null,
      p_source: params.source || null,
      p_requirement: params.requirement || null,
      p_budget_min: params.budget_min ?? null,
      p_budget_max: params.budget_max ?? null,
      p_estimated_value: params.estimated_value ?? null,
      p_priority: params.priority || 'warm',
      p_assigned_to: params.assigned_to || null,
    })
  },

  // 3. Add Lead Note
  addNote: async (leadId: string, content: string): Promise<LeadNote> => {
    return callRpc<LeadNote>('add_lead_note_rpc', {
      p_lead_id: leadId,
      p_content: content,
    })
  },

  // 4. Log Contact
  logContact: async (params: LogContactParams): Promise<Lead> => {
    return callRpc<Lead>('log_contact_rpc', {
      p_lead_id: params.lead_id,
      p_contact_method: params.contact_method,
      p_outcome: params.outcome || null,
      p_notes: params.notes || null,
      p_follow_up_scheduled_at: params.follow_up_scheduled_at || null,
      p_follow_up_type: params.follow_up_type || null,
      p_follow_up_notes: params.follow_up_notes || null,
    })
  },

  // 5. Schedule Follow-up
  scheduleFollowUp: async (params: ScheduleFollowUpParams): Promise<FollowUp> => {
    return callRpc<FollowUp>('schedule_follow_up_rpc', {
      p_lead_id: params.lead_id,
      p_scheduled_at: params.scheduled_at,
      p_type: params.type || 'call',
      p_assigned_to: params.assigned_to || null,
      p_notes: params.notes || null,
    })
  },

  // 6. Complete Follow-up
  completeFollowUp: async (followUpId: string, outcome?: string, notes?: string): Promise<FollowUp> => {
    return callRpc<FollowUp>('complete_follow_up_rpc', {
      p_follow_up_id: followUpId,
      p_outcome: outcome || null,
      p_notes: notes || null,
    })
  },

  // 7. Reschedule Follow-up
  rescheduleFollowUp: async (followUpId: string, scheduledAt: string, type?: FollowUpType, assignedTo?: string, notes?: string): Promise<FollowUp> => {
    return callRpc<FollowUp>('reschedule_follow_up_rpc', {
      p_follow_up_id: followUpId,
      p_scheduled_at: scheduledAt,
      p_type: type || null,
      p_assigned_to: assignedTo || null,
      p_notes: notes || null,
    })
  },

  // 8. Cancel Follow-up
  cancelFollowUp: async (followUpId: string, reason?: string): Promise<FollowUp> => {
    return callRpc<FollowUp>('cancel_follow_up_rpc', {
      p_follow_up_id: followUpId,
      p_reason: reason || null,
    })
  },

  // 9. Change Lead Stage
  changeStage: async (leadId: string, newStage: LeadStage): Promise<Lead> => {
    return callRpc<Lead>('change_lead_stage_rpc', {
      p_lead_id: leadId,
      p_new_stage: newStage,
    })
  },

  // 10. Mark Lead Lost
  markLost: async (leadId: string, lostReason: LostReason, lostNotes?: string): Promise<Lead> => {
    return callRpc<Lead>('mark_lead_lost_rpc', {
      p_lead_id: leadId,
      p_lost_reason: lostReason,
      p_lost_notes: lostNotes || null,
    })
  },

  // 11. Assign Lead
  assignLead: async (leadId: string, assignedTo: string | null): Promise<Lead> => {
    return callRpc<Lead>('assign_lead_rpc', {
      p_lead_id: leadId,
      p_assigned_to: assignedTo || null,
    })
  },

  // 12. Bulk Update Leads
  bulkUpdateLeads: async (workspaceId: string, leadIds: string[], updates: BulkUpdateParams): Promise<number> => {
    return callRpc<number>('bulk_update_leads_rpc', {
      p_workspace_id: workspaceId,
      p_lead_ids: leadIds,
      p_updates: updates,
    })
  },

  // 13. Import Leads CSV Batch
  importLeads: async (workspaceId: string, leads: ImportLeadItem[], skipDuplicates: boolean = true): Promise<ImportLeadsResult> => {
    return callRpc<ImportLeadsResult>('import_leads_rpc', {
      p_workspace_id: workspaceId,
      p_leads: leads,
      p_skip_duplicates: skipDuplicates,
    })
  },

  // 14. Update Workspace Settings
  updateWorkspaceSettings: async (
    workspaceId: string,
    name: string,
    timezone: string,
    currency: string,
    hotLeadInactivityHours: number,
    newLeadContactThresholdHours: number,
    highValueThreshold: number | null
  ) => {
    return callRpc('update_workspace_settings_rpc', {
      p_workspace_id: workspaceId,
      p_name: name,
      p_timezone: timezone,
      p_currency: currency,
      p_hot_lead_inactivity_hours: hotLeadInactivityHours,
      p_new_lead_contact_threshold_hours: newLeadContactThresholdHours,
      p_high_value_threshold: highValueThreshold,
    })
  },

  // Query Workspace Members for selectors
  getWorkspaceMembers: async (workspaceId: string) => {
    if (!supabase) return []

    // 1. Fetch active workspace members
    const { data: memsData, error: memsErr } = await supabase
      .from('workspace_members')
      .select('user_id, role, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')

    if (memsErr) {
      console.error('[Error fetching workspace_members in getWorkspaceMembers]', {
        message: memsErr.message,
        details: memsErr.details,
        hint: memsErr.hint,
        code: memsErr.code,
      })
      return []
    }

    const memsList = (memsData || []) as Array<{ user_id: string; role: WorkspaceRole; status: string }>
    if (memsList.length === 0) return []

    const userIds = memsList.map((m) => m.user_id)

    // 2. Fetch profiles separately
    const { data: profsData, error: profsErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    if (profsErr) {
      console.error('[Error fetching profiles in getWorkspaceMembers]', {
        message: profsErr.message,
        details: profsErr.details,
        hint: profsErr.hint,
        code: profsErr.code,
      })
    }

    const profMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
    if (profsData) {
      (profsData as Array<{ id: string; full_name: string; avatar_url: string | null }>).forEach((p) => {
        profMap[p.id] = p
      })
    }

    return memsList.map((item) => {
      const prof = profMap[item.user_id]
      return {
        userId: item.user_id,
        role: item.role,
        fullName: prof?.full_name || 'Agent',
        avatarUrl: prof?.avatar_url || null,
      }
    })
  },

  // Query Lead Details with related items
  getLeadById: async (leadId: string) => {
    if (!supabase) throw new Error('Supabase client uninitialized')
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadErr) throw leadErr

    // Fetch activities
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    // Fetch notes
    const { data: notes } = await supabase
      .from('lead_notes')
      .select(`
        *,
        author:profiles(full_name, avatar_url)
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    // Fetch follow-ups
    const { data: followUps } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('lead_id', leadId)
      .order('scheduled_at', { ascending: true })

    return {
      lead: lead as Lead,
      activities: (activities || []) as Activity[],
      notes: (notes || []) as Array<LeadNote & { author?: { full_name: string; avatar_url: string | null } }>,
      followUps: (followUps || []) as FollowUp[],
    }
  },

  // Query Workspace Leads List with Pagination & Search Filtering
  getLeads: async (workspaceId: string, options?: GetLeadsOptions) => {
    if (!supabase) throw new Error('Supabase client uninitialized')

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .is('archived_at', null)

    // Filters
    if (options?.stageFilter && options.stageFilter !== 'all') {
      query = query.eq('stage', options.stageFilter)
    }

    if (options?.priorityFilter && options.priorityFilter !== 'all') {
      query = query.eq('priority', options.priorityFilter)
    }

    if (options?.statusFilter && options.statusFilter !== 'all') {
      query = query.eq('status', options.statusFilter)
    }

    if (options?.searchQuery && options.searchQuery.trim()) {
      const q = options.searchQuery.trim()
      query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    }

    query = query.order('created_at', { ascending: false })

    // Pagination
    const page = options?.page || 1
    const pageSize = options?.pageSize || 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    query = query.range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    return {
      data: (data || []) as Lead[],
      totalCount: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // 15. Query Workspace Pipeline Stages
  getPipelineStages: async (workspaceId: string, businessType?: string): Promise<PipelineStage[]> => {
    if (!supabase) {
      const tmpl = getTemplateForBusinessType(businessType)
      return tmpl.stages.map((s) => ({
        id: s.key,
        stage_key: s.key,
        label: s.label,
        position: s.position,
        is_won: !!s.is_won,
        is_lost: !!s.is_lost,
        requires_next_action: !!s.requires_next_action,
      }))
    }

    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('position', { ascending: true })

    if (error || !data || data.length === 0) {
      const tmpl = getTemplateForBusinessType(businessType)
      return tmpl.stages.map((s) => ({
        id: s.key,
        stage_key: s.key,
        label: s.label,
        position: s.position,
        is_won: !!s.is_won,
        is_lost: !!s.is_lost,
        requires_next_action: !!s.requires_next_action,
      }))
    }

    return data as PipelineStage[]
  },

  // 16. Archive Lead
  archiveLead: async (leadId: string): Promise<boolean> => {
    try {
      await callRpc('archive_lead_rpc', { p_lead_id: leadId })
      return true
    } catch (err) {
      console.error('Error archiving lead:', err)
      return false
    }
  },

  // 17. Restore Archived Lead
  restoreArchivedLead: async (leadId: string): Promise<boolean> => {
    try {
      await callRpc('restore_archived_lead_rpc', { p_lead_id: leadId })
      return true
    } catch (err) {
      console.error('Error restoring archived lead:', err)
      return false
    }
  },

  // 18. Soft Delete Lead (Move to Trash)
  softDeleteLead: async (leadId: string, deletionReason?: string): Promise<boolean> => {
    try {
      await callRpc('soft_delete_lead_rpc', {
        p_lead_id: leadId,
        p_deletion_reason: deletionReason || null,
      })
      return true
    } catch (err) {
      console.error('Error moving lead to trash:', err)
      return false
    }
  },

  // 19. Restore Deleted Lead (From Trash)
  restoreDeletedLead: async (leadId: string): Promise<boolean> => {
    try {
      await callRpc('restore_deleted_lead_rpc', { p_lead_id: leadId })
      return true
    } catch (err) {
      console.error('Error restoring deleted lead:', err)
      return false
    }
  },

  // 20. Permanently Delete Lead (Owner Only)
  permanentlyDeleteLead: async (leadId: string, confirmation: string): Promise<boolean> => {
    try {
      await callRpc('permanently_delete_lead_rpc', {
        p_lead_id: leadId,
        p_confirmation: confirmation,
      })
      return true
    } catch (err) {
      console.error('Error permanently deleting lead:', err)
      return false
    }
  },

  // 21. Query Archived Leads
  getArchivedLeads: async (workspaceId: string) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })

    if (error) {
      console.error('Error fetching archived leads:', error)
      return []
    }
    return (data || []) as Lead[]
  },

  // 22. Query Trash Leads
  getTrashLeads: async (workspaceId: string) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) {
      console.error('Error fetching trash leads:', error)
      return []
    }
    return (data || []) as Lead[]
  },
}
