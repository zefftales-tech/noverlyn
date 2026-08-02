import { supabase, isSupabaseConfigured } from './supabase'

export interface LeadCommunication {
  id: string
  workspace_id: string
  lead_id: string
  direction: 'incoming' | 'outgoing'
  channel: string
  message: string
  communication_status: string
  occurred_at: string
  logged_by: string
  assigned_to: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface MessageTemplate {
  id: string
  workspace_id: string
  name: string
  category: string
  content: string
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface LogCommunicationParams {
  lead_id: string
  direction: 'incoming' | 'outgoing'
  message: string
  occurred_at?: string
  schedule_followup?: string
  followup_type?: string
  followup_notes?: string
}

async function callRpc<T>(
  fnName: string,
  params: Record<string, unknown>
): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { code?: string; message: string; details?: string; hint?: string } | null }>)(fnName, params)

  if (error) {
    console.error(`[RPC Error: ${fnName}]`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    throw new Error(error.message || `RPC ${fnName} failed`)
  }

  return data as T
}

export const communicationsApi = {
  // 1. Fetch Communications for a Lead
  getLeadCommunications: async (leadId: string): Promise<LeadCommunication[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    const { data, error } = await supabase
      .from('lead_communications' as never)
      .select('*')
      .eq('lead_id', leadId)
      .order('occurred_at', { ascending: false })

    if (error) {
      console.error('[communicationsApi.getLeadCommunications failed]', error)
      throw error
    }

    return (data || []) as unknown as LeadCommunication[]
  },

  // 2. Log a WhatsApp Communication via RPC
  logCommunication: async (params: LogCommunicationParams): Promise<{ success: boolean; communication_id: string; communication_status: string }> => {
    return callRpc<{ success: boolean; communication_id: string; communication_status: string }>('log_lead_communication_rpc', {
      p_lead_id: params.lead_id,
      p_direction: params.direction,
      p_message: params.message,
      p_occurred_at: params.occurred_at || new Date().toISOString(),
      p_schedule_followup: params.schedule_followup || null,
      p_followup_type: params.followup_type || null,
      p_followup_notes: params.followup_notes || null,
    })
  },

  // 3. Update Lead Communication Status via RPC
  updateCommunicationStatus: async (leadId: string, status: 'none' | 'awaiting_reply' | 'needs_response' | 'active' | 'resolved'): Promise<{ success: boolean; status: string }> => {
    return callRpc<{ success: boolean; status: string }>('update_lead_communication_status_rpc', {
      p_lead_id: leadId,
      p_status: status,
    })
  },

  // 4. Fetch Message Templates for Workspace
  getMessageTemplates: async (workspaceId: string): Promise<MessageTemplate[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    const { data, error } = await supabase
      .from('message_templates' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('category', { ascending: true })

    if (error) {
      console.error('[communicationsApi.getMessageTemplates failed]', error)
      throw error
    }

    return (data || []) as unknown as MessageTemplate[]
  },

  // 5. Create Message Template (Owner / Manager)
  createTemplate: async (workspaceId: string, name: string, category: string, content: string): Promise<{ success: boolean; template_id: string }> => {
    return callRpc<{ success: boolean; template_id: string }>('create_message_template_rpc', {
      p_workspace_id: workspaceId,
      p_name: name,
      p_category: category,
      p_content: content,
    })
  },

  // 6. Update Message Template (Owner / Manager)
  updateTemplate: async (templateId: string, name: string, category: string, content: string, isActive: boolean): Promise<{ success: boolean }> => {
    return callRpc<{ success: boolean }>('update_message_template_rpc', {
      p_template_id: templateId,
      p_name: name,
      p_category: category,
      p_content: content,
      p_is_active: isActive,
    })
  },

  // 7. Delete Message Template (Owner / Manager)
  deleteTemplate: async (templateId: string): Promise<{ success: boolean }> => {
    return callRpc<{ success: boolean }>('delete_message_template_rpc', {
      p_template_id: templateId,
    })
  },
}
