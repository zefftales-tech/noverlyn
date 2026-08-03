import { supabase, isSupabaseConfigured } from './supabase'
import type { WhatsAppApiError } from './whatsappCloudApi'

export interface WhatsAppConversation {
  id: string
  workspace_id: string
  connection_id: string
  lead_id: string | null
  contact_phone: string
  contact_name: string | null
  status: 'open' | 'waiting' | 'resolved' | 'blocked'
  assigned_to: string | null
  last_message_at: string | null
  last_incoming_at: string | null
  last_outgoing_at: string | null
  last_message_preview: string | null
  unread_count: number
  needs_response: boolean
  resolved_at: string | null
  resolved_by: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  lead?: {
    id: string
    name: string
    status: string
    priority: string
  }
}

export interface WhatsAppMessage {
  id: string
  workspace_id: string
  connection_id: string
  conversation_id: string
  lead_id: string | null
  meta_message_id: string | null
  direction: 'incoming' | 'outgoing'
  message_type: string
  text_body: string | null
  media_id: string | null
  media_mime_type: string | null
  media_filename: string | null
  media_caption: string | null
  status: 'received' | 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed'
  error_code: string | null
  error_message: string | null
  sent_by: string | null
  occurred_at: string
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  created_at: string
}

export interface WhatsAppContactReview {
  id: string
  workspace_id: string
  connection_id: string
  conversation_id: string
  contact_phone: string
  contact_name: string | null
  status: 'pending' | 'approved' | 'linked' | 'rejected' | 'spam'
  possible_duplicate_lead_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_lead_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  conversation?: WhatsAppConversation
}

export interface ConversationFilters {
  status?: 'all' | 'open' | 'waiting' | 'resolved' | 'needs_response' | 'unread' | 'unassigned' | 'assigned_to_me'
  search?: string
  currentUserId?: string
}

export const whatsappInboxApi = {
  // 1. Fetch Conversations for a Workspace
  getConversations: async (workspaceId: string, filters: ConversationFilters = {}): Promise<WhatsAppConversation[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    let query = supabase
      .from('whatsapp_conversations' as never)
      .select('*, lead:leads(id, name, status, priority)')
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (filters.status === 'open') {
      query = query.eq('status', 'open')
    } else if (filters.status === 'waiting') {
      query = query.eq('status', 'waiting')
    } else if (filters.status === 'resolved') {
      query = query.eq('status', 'resolved')
    } else if (filters.status === 'needs_response') {
      query = query.eq('needs_response', true)
    } else if (filters.status === 'unread') {
      query = query.gt('unread_count', 0)
    } else if (filters.status === 'unassigned') {
      query = query.is('assigned_to', null)
    } else if (filters.status === 'assigned_to_me' && filters.currentUserId) {
      query = query.eq('assigned_to', filters.currentUserId)
    }

    if (filters.search && filters.search.trim()) {
      const s = filters.search.trim()
      query = query.or(`contact_phone.ilike.%${s}%,contact_name.ilike.%${s}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[whatsappInboxApi.getConversations failed]', error)
      return []
    }

    return (data || []) as unknown as WhatsAppConversation[]
  },

  // 2. Fetch Messages for a Conversation
  getMessages: async (conversationId: string): Promise<WhatsAppMessage[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    const { data, error } = await supabase
      .from('whatsapp_messages' as never)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('occurred_at', { ascending: true })

    if (error) {
      console.error('[whatsappInboxApi.getMessages failed]', error)
      return []
    }

    return (data || []) as unknown as WhatsAppMessage[]
  },

  // 3. Fetch Contact Reviews for a Workspace
  getContactReviews: async (workspaceId: string, statusFilter: string = 'pending'): Promise<WhatsAppContactReview[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    const { data, error } = await supabase
      .from('whatsapp_contact_reviews' as never)
      .select('*, conversation:whatsapp_conversations(*)')
      .eq('workspace_id', workspaceId)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[whatsappInboxApi.getContactReviews failed]', error)
      return []
    }

    return (data || []) as unknown as WhatsAppContactReview[]
  },

  // 4. Mark Conversation Read RPC
  markRead: async (conversationId: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('mark_whatsapp_conversation_read_rpc' as never, {
      p_conversation_id: conversationId,
    } as never)

    if (error) {
      console.error('[whatsappInboxApi.markRead failed]', error)
      return false
    }

    return true
  },

  // 5. Secure Assign Conversation RPC
  assignConversation: async (conversationId: string, agentId: string | null): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('assign_whatsapp_conversation_rpc' as never, {
      p_conversation_id: conversationId,
      p_assigned_to: agentId,
    } as never)

    if (error) {
      console.error('[whatsappInboxApi.assignConversation failed]', error)
      return false
    }

    return true
  },

  // 6. Secure Update Conversation Status RPC
  updateConversationStatus: async (conversationId: string, status: 'open' | 'waiting' | 'resolved' | 'blocked'): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase.rpc('update_whatsapp_conversation_status_rpc' as never, {
      p_conversation_id: conversationId,
      p_status: status,
    } as never)

    if (error) {
      console.error('[whatsappInboxApi.updateConversationStatus failed]', error)
      return false
    }

    return true
  },

  // 7. Create Lead from Review RPC
  createLeadFromReview: async (params: {
    review_id: string
    lead_name: string
    assigned_to?: string | null
    stage?: string
    priority?: string
  }): Promise<{ success: boolean; lead_id: string }> => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.rpc('create_lead_from_whatsapp_review_rpc' as never, {
      p_review_id: params.review_id,
      p_lead_name: params.lead_name,
      p_assigned_to: params.assigned_to || null,
      p_stage: params.stage || 'New',
      p_priority: params.priority || 'Medium',
    } as never)

    if (error) {
      console.error('[whatsappInboxApi.createLeadFromReview failed]', error)
      throw error
    }

    return data as unknown as { success: boolean; lead_id: string }
  },

  // 8. Link Review to Existing Lead RPC
  linkReviewToLead: async (reviewId: string, leadId: string): Promise<{ success: boolean; lead_id: string }> => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.rpc('link_whatsapp_conversation_to_lead_rpc' as never, {
      p_review_id: reviewId,
      p_lead_id: leadId,
    } as never)

    if (error) {
      console.error('[whatsappInboxApi.linkReviewToLead failed]', error)
      throw error
    }

    return data as unknown as { success: boolean; lead_id: string }
  },

  // 9. Send Reply Message via Cloud API
  sendReplyMessage: async (params: {
    workspace_id: string
    conversation_id: string
    text_body?: string
    template_name?: string
    language_code?: string
  }): Promise<{ success: boolean; message_id: string }> => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.functions.invoke('whatsapp-connection-manage', {
      body: {
        action: 'send-reply',
        ...params,
      },
    })

    if (error) {
      let serverBody: Record<string, unknown> | null = null
      const errorWithContext = error as unknown as { context?: Response }

      if (errorWithContext?.context && typeof errorWithContext.context.json === 'function') {
        try {
          serverBody = await errorWithContext.context.json()
        } catch {
          // ignore
        }
      }

      if (serverBody) {
        const displayMsg =
          (serverBody.meta_user_message as string) ||
          (serverBody.meta_message as string) ||
          (serverBody.error as string) ||
          error.message

        const apiErr: WhatsAppApiError = new Error(displayMsg)
        apiErr.meta_status = serverBody.meta_status as number | undefined
        apiErr.meta_code = serverBody.meta_code as number | undefined
        apiErr.meta_subcode = serverBody.meta_subcode as number | undefined
        apiErr.meta_message = serverBody.meta_message as string | undefined
        apiErr.meta_user_message = serverBody.meta_user_message as string | undefined
        apiErr.trace_id = serverBody.trace_id as string | undefined
        throw apiErr
      }

      throw error
    }

    return data as unknown as { success: boolean; message_id: string }
  },
}
