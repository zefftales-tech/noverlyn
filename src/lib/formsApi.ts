import { supabase } from './supabase'

export type CustomFieldType = 'short_text' | 'long_text' | 'number' | 'select' | 'date' | 'checkbox'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'spam' | 'deleted'

export interface CustomFieldDefinition {
  id: string
  key: string
  label: string
  type: CustomFieldType
  required: boolean
  placeholder?: string
  help_text?: string
  options?: string[]
  display_order: number
  is_active: boolean
}

export interface PublicFormSubmission {
  id: string
  workspace_id: string
  form_id: string
  status: SubmissionStatus
  full_name: string
  phone: string
  email: string | null
  requirement: string
  source: string | null
  source_detail: string | null
  budget: number | null
  custom_answers: Record<string, { label: string; type: string; value: string | boolean | number }>
  possible_duplicate: boolean
  duplicate_lead_id: string | null
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  approved_lead_id: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
}

export interface PublicFormInfo {
  form_id: string
  workspace_id: string
  workspace_name: string
  business_type: string
  currency: string
  title: string
  description: string | null
  is_active: boolean
  show_email: boolean
  show_source: boolean
  show_budget: boolean
  custom_fields?: CustomFieldDefinition[]
}

export interface SubmitFormParams {
  slug: string
  full_name: string
  phone: string
  requirement?: string
  email?: string
  source?: string
  budget?: number
  honeypot?: string
  custom_answers?: Record<string, string | boolean | number>
}

export interface SubmitFormResult {
  success: boolean
  lead_id?: string
  is_duplicate?: boolean
  message?: string
}

export interface LeadFormConfig {
  id: string
  workspace_id: string
  slug: string
  title: string
  description: string | null
  is_active: boolean
  submission_mode: 'review' | 'automatic'
  show_email: boolean
  show_source: boolean
  show_budget: boolean
  custom_fields?: CustomFieldDefinition[]
  archived_at?: string | null
  deleted_at?: string | null
  submission_count: number
  created_at: string
  updated_at: string
}

export interface UpdateFormConfigParams {
  workspace_id: string
  title: string
  description?: string
  is_active: boolean
  submission_mode?: 'review' | 'automatic'
  show_email: boolean
  show_source: boolean
  show_budget: boolean
  custom_fields?: CustomFieldDefinition[]
}

export interface ApproveSubmissionParams {
  submission_id: string
  assigned_to?: string
  priority?: string
  stage_key?: string
  next_follow_up_at?: string
  internal_note?: string
}

async function callRpc<T>(fnName: string, params: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase client uninitialized')
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>)(fnName, params)

  if (error) throw error
  return data as T
}

export const formsApi = {
  // Public Form Info Lookup (Unauthenticated)
  getPublicFormInfo: async (slug: string): Promise<PublicFormInfo> => {
    return callRpc<PublicFormInfo>('get_public_lead_form_rpc', {
      p_slug: slug,
    })
  },

  // Public Form Submission (Unauthenticated & Rate Protected)
  submitPublicForm: async (params: SubmitFormParams): Promise<SubmitFormResult> => {
    return callRpc<SubmitFormResult>('submit_public_lead_form_rpc', {
      p_slug: params.slug,
      p_full_name: params.full_name,
      p_phone: params.phone,
      p_requirement: params.requirement || null,
      p_email: params.email || null,
      p_source: params.source || null,
      p_budget: params.budget ?? null,
      p_honeypot: params.honeypot || null,
      p_custom_answers: params.custom_answers || {},
    })
  },

  // Protected: Fetch Workspace Lead Form Configuration
  getWorkspaceLeadForm: async (workspaceId: string): Promise<LeadFormConfig | null> => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('lead_forms' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .single()

    if (error) {
      try {
        const { data: seeded } = await (supabase.rpc as unknown as (
          fnName: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: Error | null }>)('get_public_lead_form_rpc', { p_slug: workspaceId })

        if (seeded) {
          const { data: fresh } = await supabase
            .from('lead_forms' as never)
            .select('*')
            .eq('workspace_id', workspaceId)
            .single()

          return (fresh as unknown) as LeadFormConfig
        }
      } catch (err) {
        console.error('Error auto-seeding lead form:', err)
      }
      return null
    }

    return (data as unknown) as LeadFormConfig
  },

  // Protected: Update Workspace Lead Form Configuration (Owners & Managers)
  updateWorkspaceLeadForm: async (params: UpdateFormConfigParams): Promise<LeadFormConfig> => {
    return callRpc<LeadFormConfig>('update_lead_form_rpc', {
      p_workspace_id: params.workspace_id,
      p_title: params.title,
      p_description: params.description || null,
      p_is_active: params.is_active,
      p_submission_mode: params.submission_mode || 'review',
      p_show_email: params.show_email,
      p_show_source: params.show_source,
      p_show_budget: params.show_budget,
      p_custom_fields: params.custom_fields || [],
    })
  },

  // Fetch Submissions for Review Inbox
  getSubmissions: async (workspaceId: string, statusFilter: SubmissionStatus = 'pending'): Promise<PublicFormSubmission[]> => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('public_form_submissions' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', statusFilter)
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('Error fetching form submissions:', error)
      return []
    }
    return (data || []) as unknown as PublicFormSubmission[]
  },

  // Get Pending Count for Workspace Badge
  getPendingCount: async (workspaceId: string): Promise<number> => {
    if (!supabase) return 0
    const { count, error } = await supabase
      .from('public_form_submissions' as never)
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')

    if (error) return 0
    return count || 0
  },

  // Approve Submission via Secure RPC
  approveSubmission: async (params: ApproveSubmissionParams): Promise<{ success: boolean; lead_id?: string }> => {
    return callRpc<{ success: boolean; lead_id?: string }>('approve_public_form_submission_rpc', {
      p_submission_id: params.submission_id,
      p_assigned_to: params.assigned_to || null,
      p_priority: params.priority || 'warm',
      p_stage_key: params.stage_key || null,
      p_next_follow_up_at: params.next_follow_up_at || null,
      p_internal_note: params.internal_note || null,
    })
  },

  // Change Submission Status (Reject / Spam / Soft Delete / Restore)
  processSubmissionStatus: async (submissionId: string, targetStatus: SubmissionStatus, rejectionReason?: string): Promise<boolean> => {
    try {
      await callRpc('process_public_form_submission_status_rpc', {
        p_submission_id: submissionId,
        p_target_status: targetStatus,
        p_rejection_reason: rejectionReason || null,
      })
      return true
    } catch (err) {
      console.error('Error processing submission status:', err)
      return false
    }
  },

  // Permanently Delete Submission (Owner Only)
  permanentlyDeleteSubmission: async (submissionId: string): Promise<boolean> => {
    try {
      await callRpc('permanently_delete_submission_rpc', {
        p_submission_id: submissionId,
      })
      return true
    } catch (err) {
      console.error('Error permanently deleting submission:', err)
      return false
    }
  },

  // Archive Lead Form
  archiveLeadForm: async (formId: string): Promise<boolean> => {
    try {
      await callRpc('archive_lead_form_rpc', { p_form_id: formId })
      return true
    } catch (err) {
      console.error('Error archiving lead form:', err)
      throw err
    }
  },

  // Restore Archived Lead Form
  restoreArchivedLeadForm: async (formId: string): Promise<boolean> => {
    try {
      await callRpc('restore_archived_lead_form_rpc', { p_form_id: formId })
      return true
    } catch (err) {
      console.error('Error restoring archived lead form:', err)
      throw err
    }
  },

  // Soft Delete Lead Form (Move to Trash)
  softDeleteLeadForm: async (formId: string): Promise<boolean> => {
    try {
      await callRpc('soft_delete_lead_form_rpc', { p_form_id: formId })
      return true
    } catch (err) {
      console.error('Error soft-deleting lead form:', err)
      throw err
    }
  },

  // Restore Deleted Lead Form (From Trash)
  restoreDeletedLeadForm: async (formId: string): Promise<boolean> => {
    try {
      await callRpc('restore_deleted_lead_form_rpc', { p_form_id: formId })
      return true
    } catch (err) {
      console.error('Error restoring deleted lead form:', err)
      throw err
    }
  },

  // Permanently Delete Lead Form (Owner Only)
  permanentlyDeleteLeadForm: async (formId: string, confirmation: string): Promise<boolean> => {
    try {
      await callRpc('permanently_delete_lead_form_rpc', {
        p_form_id: formId,
        p_confirmation: confirmation,
      })
      return true
    } catch (err) {
      console.error('Error permanently deleting lead form:', err)
      throw err
    }
  },

  // Get Workspace Forms by Status ('active' | 'archived' | 'deleted')
  getWorkspaceLeadForms: async (workspaceId: string, status: 'active' | 'archived' | 'deleted' = 'active'): Promise<LeadFormConfig[]> => {
    if (!supabase) return []
    let query = supabase.from('lead_forms').select('*').eq('workspace_id', workspaceId)

    if (status === 'active') {
      query = query.is('deleted_at', null).is('archived_at', null)
    } else if (status === 'archived') {
      query = query.is('deleted_at', null).not('archived_at', 'is', null)
    } else if (status === 'deleted') {
      query = query.not('deleted_at', 'is', null)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching workspace lead forms:', error)
      return []
    }
    return (data || []) as unknown as LeadFormConfig[]
  },
}
