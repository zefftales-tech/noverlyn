import { supabase, isSupabaseConfigured, getValidAccessToken } from './supabase'

export interface WorkspaceAiContext {
  id: string
  workspace_id: string
  business_summary: string | null
  products_services: Array<{ name: string; description: string; price_range?: string }>
  qualification_rules: Record<string, unknown>
  reply_tone: 'professional' | 'friendly' | 'consultative' | 'direct'
  restricted_claims: string[]
  custom_instructions: string | null
  trigger_mode: 'off' | 'manual_only' | 'important_messages' | 'every_incoming_message'
  daily_analysis_limit: number
  cooldown_seconds: number
  is_enabled: boolean
  updated_at: string
}

export interface ExtractedField {
  field: string
  value: unknown
  confidence: number
  evidence_message_ids: string[]
  evidence: string
  action: 'add' | 'update' | 'keep_existing' | 'conflict'
}

export interface CustomFieldSuggestion {
  target_custom_field_id: string
  target_field: string
  suggested_value: unknown
  confidence: number
  evidence: string
}

export interface AiConversationAnalysis {
  id: string
  workspace_id: string
  conversation_id: string
  lead_id: string | null
  fingerprint: string
  analysis_status: 'pending' | 'processing' | 'ready' | 'partially_approved' | 'approved' | 'dismissed' | 'failed' | 'outdated'
  trigger_type: 'manual' | 'incoming_message' | 'conversation_opened' | 'lead_review' | 'scheduled'
  model_provider: string | null
  model_name: string | null
  input_message_count: number
  overall_confidence: number | null
  customer_intent: string | null
  requirement_summary: string | null
  urgency: 'immediate' | 'high' | 'normal' | 'low' | 'unknown' | null
  lead_score: number | null
  lead_temperature: 'hot' | 'warm' | 'cold' | 'unknown' | null
  recommended_next_action: string | null
  recommended_action_reason: string | null
  recommended_follow_up_at: string | null
  suggested_reply: string | null
  extracted_data: {
    customer_intent?: { value: string; confidence: number; evidence_message_ids: string[] }
    requirement_summary?: { value: string; confidence: number; evidence_message_ids: string[] }
    qualification?: { lead_score: number; lead_temperature: string; urgency: string; reasoning_summary: string }
    extracted_fields?: ExtractedField[]
    custom_field_suggestions?: CustomFieldSuggestion[]
    buying_signals?: string[]
    objections?: string[]
    missing_information?: string[]
    next_best_action?: { action: string; reason: string; recommended_at: string | null; confidence: number }
    suggested_reply?: { text: string; goal: string; confidence: number }
  }
  custom_field_suggestions: CustomFieldSuggestion[]
  missing_information: string[]
  objections: string[]
  buying_signals: string[]
  error_message: string | null
  created_at: string
}

export interface AiLeadSuggestion {
  id: string
  workspace_id: string
  analysis_id: string
  conversation_id: string
  lead_id: string | null
  suggestion_type: 'lead_field' | 'custom_field' | 'qualification' | 'next_action' | 'follow_up' | 'reply' | 'missing_information' | 'objection' | 'buying_signal'
  target_field: string | null
  target_custom_field_id: string | null
  current_value: unknown
  suggested_value: unknown
  confidence: number
  evidence_message_ids: string[]
  evidence_text: string | null
  status: 'pending' | 'approved' | 'rejected' | 'superseded' | 'applied'
  created_at: string
}

export const aiIntelligenceApi = {
  // 1. Fetch Workspace AI Context
  getAiContext: async (workspaceId: string): Promise<WorkspaceAiContext | null> => {
    if (!isSupabaseConfigured || !supabase) return null

    const { data, error } = await supabase
      .from('workspace_ai_context' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      console.error('[aiIntelligenceApi.getAiContext failed]', error)
      return null
    }

    return data as unknown as WorkspaceAiContext
  },

  // 2. Save / Update Workspace AI Context
  saveAiContext: async (workspaceId: string, updates: Partial<WorkspaceAiContext>): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const { error } = await supabase
      .from('workspace_ai_context' as never)
      .upsert({
        workspace_id: workspaceId,
        ...updates,
        updated_at: new Date().toISOString(),
      } as never)

    if (error) {
      console.error('[aiIntelligenceApi.saveAiContext failed]', error)
      return false
    }

    return true
  },

  // 3. Trigger Conversation Analysis via Edge Function
  analyzeConversation: async (params: {
    workspace_id: string
    conversation_id: string
    trigger_type?: 'manual' | 'incoming_message' | 'conversation_opened' | 'lead_review' | 'scheduled'
    force_reanalyze?: boolean
  }): Promise<{ analysis: AiConversationAnalysis; suggestions: AiLeadSuggestion[]; cached: boolean }> => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

    let token: string
    try {
      token = await getValidAccessToken()
    } catch {
      throw new Error('Your session has expired. Please sign in again.')
    }

    const { data, error } = await supabase.functions.invoke('ai-conversation-analyze', {
      body: params,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (error) {
      console.error('[aiIntelligenceApi.analyzeConversation failed]', error)
      throw error
    }

    return data as unknown as { analysis: AiConversationAnalysis; suggestions: AiLeadSuggestion[]; cached: boolean }
  },

  // 4. Fetch Latest Analysis for a Conversation
  getLatestAnalysis: async (conversationId: string): Promise<AiConversationAnalysis | null> => {
    if (!isSupabaseConfigured || !supabase) return null

    const { data, error } = await supabase
      .from('ai_conversation_analyses' as never)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      console.error('[aiIntelligenceApi.getLatestAnalysis failed]', error)
      return null
    }

    return data as unknown as AiConversationAnalysis
  },

  // 5. Fetch Suggestions for an Analysis
  getSuggestions: async (analysisId: string): Promise<AiLeadSuggestion[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    const { data, error } = await supabase
      .from('ai_lead_suggestions' as never)
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[aiIntelligenceApi.getSuggestions failed]', error)
      return []
    }

    return (data || []) as unknown as AiLeadSuggestion[]
  },

  // 6. Apply Approved Suggestions via Secure RPC
  applySuggestions: async (params: {
    analysis_id: string
    suggestion_ids: string[]
    create_follow_up?: boolean
  }): Promise<{ success: boolean; applied_count: number; lead_id: string }> => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.rpc('apply_ai_conversation_suggestions_rpc' as never, {
      p_analysis_id: params.analysis_id,
      p_suggestion_ids: params.suggestion_ids,
      p_create_follow_up: params.create_follow_up || false,
    } as never)

    if (error) {
      console.error('[aiIntelligenceApi.applySuggestions failed]', error)
      throw error
    }

    return data as unknown as { success: boolean; applied_count: number; lead_id: string }
  },
}
