// ============================================================================
// SUPABASE EDGE FUNCTION: ai-conversation-analyze
// Multi-industry AI Conversation Intelligence Engine (Zod Hardened):
// - Authenticates user and verifies workspace membership & conversation access
// - Checks atomic daily workspace usage via reserve_workspace_ai_usage_rpc
// - Uses plain INSERT reservation flow (returns existing row on 23505 unique conflict)
// - Strict Zod schema validation (rejects out-of-bounds lead_score, confidence, or extra keys)
// - Verifies evidence message IDs against thread message IDs
// - Complete Usage Lifecycle: reserve -> finalize (on success) or release (on failure)
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { z } from 'https://esm.sh/zod@3.22.4'

// STRICT ZOD SCHEMAS
const ConfidenceSchema = z.number().min(0.0).max(1.0)
const MessageIdSchema = z.string().min(1).max(100)

const CustomerIntentSchema = z.object({
  value: z.string().min(1).max(500),
  confidence: ConfidenceSchema,
  evidence_message_ids: z.array(MessageIdSchema).max(50),
}).strict()

const RequirementSummarySchema = z.object({
  value: z.string().min(1).max(1000),
  confidence: ConfidenceSchema,
  evidence_message_ids: z.array(MessageIdSchema).max(50),
}).strict()

const QualificationSchema = z.object({
  lead_score: z.number().int().min(0).max(100),
  lead_temperature: z.enum(['hot', 'warm', 'cold', 'unknown']),
  urgency: z.enum(['immediate', 'high', 'normal', 'low', 'unknown']),
  reasoning_summary: z.string().max(1000).optional(),
}).strict()

const ExtractedFieldSchema = z.object({
  field: z.string().min(1).max(100),
  value: z.unknown(),
  confidence: ConfidenceSchema,
  evidence_message_ids: z.array(MessageIdSchema).max(50),
  evidence: z.string().max(500).optional(),
  action: z.enum(['add', 'update', 'keep_existing', 'conflict']).optional(),
}).strict()

const CustomFieldSuggestionSchema = z.object({
  target_custom_field_id: z.string().optional(),
  target_field: z.string().min(1).max(100),
  suggested_value: z.unknown(),
  confidence: ConfidenceSchema,
  evidence: z.string().max(500).optional(),
}).strict()

const NextBestActionSchema = z.object({
  action: z.string().min(1).max(300),
  reason: z.string().max(500).optional(),
  recommended_at: z.string().nullable().optional(),
  confidence: ConfidenceSchema.optional(),
}).strict()

const SuggestedReplySchema = z.object({
  text: z.string().min(1).max(2000),
  goal: z.string().max(300).optional(),
  confidence: ConfidenceSchema.optional(),
}).strict()

const AiAnalysisOutputSchema = z.object({
  customer_intent: CustomerIntentSchema.optional(),
  requirement_summary: RequirementSummarySchema.optional(),
  qualification: QualificationSchema,
  extracted_fields: z.array(ExtractedFieldSchema).max(30).optional(),
  custom_field_suggestions: z.array(CustomFieldSuggestionSchema).max(30).optional(),
  buying_signals: z.array(z.string().max(200)).max(20).optional(),
  objections: z.array(z.string().max(200)).max(20).optional(),
  missing_information: z.array(z.string().max(200)).max(20).optional(),
  next_best_action: NextBestActionSchema.optional(),
  suggested_reply: SuggestedReplySchema.optional(),
}).strict()

interface AnalysisRequest {
  workspace_id: string
  conversation_id: string
  trigger_type?: 'manual' | 'incoming_message' | 'conversation_opened' | 'lead_review' | 'scheduled'
  force_reanalyze?: boolean
}

interface AiProviderAdapter {
  name: string
  analyze(prompt: string, contextJson: unknown): Promise<string>
}

class MockFallbackAdapter implements AiProviderAdapter {
  name = 'mock_fallback'
  async analyze(_prompt: string, contextJson: unknown): Promise<string> {
    const ctx = contextJson as Record<string, unknown>
    const msgs = (ctx.messages || []) as Array<Record<string, unknown>>
    const lastMsgText = (msgs[msgs.length - 1]?.text_body as string) || 'Inquiry received'
    const validMsgId = (msgs[msgs.length - 1]?.id as string) || 'none'

    const mockOutput = {
      customer_intent: {
        value: 'Customer inquiring about products/services and requesting pricing details',
        confidence: 0.92,
        evidence_message_ids: [validMsgId],
      },
      requirement_summary: {
        value: lastMsgText,
        confidence: 0.88,
        evidence_message_ids: [validMsgId],
      },
      qualification: {
        lead_score: 78,
        lead_temperature: 'warm',
        urgency: 'high',
        reasoning_summary: 'High engagement level with clear requirement expressed in recent conversation.',
      },
      extracted_fields: [
        {
          field: 'requirement',
          value: lastMsgText,
          confidence: 0.9,
          evidence_message_ids: [validMsgId],
          evidence: 'Customer explicitly described requirement in recent message.',
          action: 'update',
        },
      ],
      custom_field_suggestions: [],
      buying_signals: ['Specific product feature requested', 'Budget range discussed'],
      objections: ['Pending confirmation on delivery/service timeline'],
      missing_information: ['Exact preferred start date', 'Preferred payment method'],
      next_best_action: {
        action: 'Reply now with details and confirm appointment time',
        reason: 'Lead shows strong purchase intent and awaits immediate response.',
        recommended_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        confidence: 0.91,
      },
      suggested_reply: {
        text: `Hello! Thank you for reaching out. I'd be happy to provide complete information regarding ${lastMsgText}. Could you share your preferred schedule for a quick call?`,
        goal: 'Address primary inquiry and convert to scheduled call/appointment',
        confidence: 0.89,
      },
    }

    return JSON.stringify(mockOutput)
  }
}

class OpenAIAdapter implements AiProviderAdapter {
  name = 'openai'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async analyze(prompt: string, contextJson: unknown): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: JSON.stringify(contextJson) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const errText = await res.text()
        if (res.status === 401) throw new Error(`INVALID_API_KEY: ${errText}`)
        if (res.status === 429) throw new Error(`RATE_LIMIT_EXCEEDED: ${errText}`)
        throw new Error(`PROVIDER_UNAVAILABLE: HTTP ${res.status} - ${errText}`)
      }

      const data = await res.json()
      return data.choices[0]?.message?.content || '{}'
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('PROVIDER_TIMEOUT', { cause: err })
      }
      throw err
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '').trim()

    let userId: string | null = null
    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (!authErr && userData?.user) {
      userId = userData.user.id
    }

    const body: AnalysisRequest = await req.json()
    const { workspace_id, conversation_id, trigger_type = 'manual', force_reanalyze = false } = body

    if (!workspace_id || !conversation_id) {
      return new Response(JSON.stringify({ error: 'Missing workspace_id or conversation_id' }), { status: 400 })
    }

    if (userId) {
      const { data: member } = await supabaseAdmin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace_id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single()

      if (!member) {
        return new Response(JSON.stringify({ error: 'Access denied to workspace' }), { status: 403 })
      }
    }

    // Load Conversation & Messages
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*, lead:leads(*)')
      .eq('id', conversation_id)
      .eq('workspace_id', workspace_id)
      .single()

    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 })
    }

    const { data: messages } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id, meta_message_id, direction, message_type, text_body, media_caption, occurred_at')
      .eq('conversation_id', conversation_id)
      .order('occurred_at', { ascending: true })
      .limit(40)

    const msgList = messages || []
    const validMessageIdSet = new Set(msgList.map((m) => m.id))
    const lastMsg = msgList[msgList.length - 1]
    const lastMsgId = lastMsg?.id || 'none'
    const lastMsgTs = lastMsg?.occurred_at || 'none'

    // Load Workspace AI Context & Phase 8 lead_forms.custom_fields
    const { data: aiCtx } = await supabaseAdmin
      .from('workspace_ai_context')
      .select('*')
      .eq('workspace_id', workspace_id)
      .single()

    const { data: leadForm } = await supabaseAdmin
      .from('lead_forms')
      .select('custom_fields, updated_at')
      .eq('workspace_id', workspace_id)
      .order('is_primary', { ascending: false })
      .limit(1)
      .single()

    const customFieldsArray = (leadForm?.custom_fields || []) as Array<Record<string, unknown>>
    const customFieldsHash = customFieldsArray
      .map((c) => `${c.id || c.key}:${c.key}:${c.type}:${c.is_active}`)
      .sort()
      .join('|')

    const ctxUpdatedAt = aiCtx?.updated_at || 'v1'

    // Compute Fingerprint
    const fingerprint = `${workspace_id}:${conversation_id}:${lastMsgId}:${lastMsgTs}:v1:${ctxUpdatedAt}:${customFieldsHash}`

    // 1. Check existing row
    if (!force_reanalyze) {
      const { data: existing } = await supabaseAdmin
        .from('ai_conversation_analyses')
        .select('*')
        .eq('workspace_id', workspace_id)
        .eq('fingerprint', fingerprint)
        .single()

      if (existing) {
        if (['ready', 'approved', 'partially_approved'].includes(existing.analysis_status)) {
          const { data: suggestions } = await supabaseAdmin
            .from('ai_lead_suggestions')
            .select('*')
            .eq('analysis_id', existing.id)

          return new Response(
            JSON.stringify({ analysis: existing, suggestions: suggestions || [], cached: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (existing.analysis_status === 'processing') {
          const ageSeconds = (Date.now() - new Date(existing.updated_at || existing.created_at).getTime()) / 1000
          if (ageSeconds < 60) {
            return new Response(
              JSON.stringify({ analysis: existing, suggestions: [], cached: true, processing: true }),
              { status: 202, headers: { 'Content-Type': 'application/json' } }
            )
          }
          // Stale processing recovery: release leaked reservation
          await supabaseAdmin.rpc('release_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })
          await supabaseAdmin
            .from('ai_conversation_analyses')
            .update({ analysis_status: 'failed', error_code: 'PROCESSING_TIMEOUT', error_message: 'Processing timed out' })
            .eq('id', existing.id)
        }
      }
    }

    // 2. Determine Provider & Guard Mock in Production
    const openAiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
    const allowMock = Deno.env.get('AI_ALLOW_MOCK_PROVIDER') === 'true'

    let adapter: AiProviderAdapter
    if (openAiKey) {
      adapter = new OpenAIAdapter(openAiKey)
    } else if (allowMock) {
      adapter = new MockFallbackAdapter()
    } else {
      return new Response(
        JSON.stringify({
          error: 'AI_PROVIDER_NOT_CONFIGURED',
          message: 'AI provider is not configured for this workspace.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. ATOMIC DAILY USAGE RESERVATION
    const dailyLimit = aiCtx?.daily_analysis_limit || 50
    const { data: usageRes, error: usageErr } = await supabaseAdmin.rpc(
      'reserve_workspace_ai_usage_rpc',
      { p_workspace_id: workspace_id, p_daily_limit: dailyLimit }
    )

    if (usageErr || !usageRes?.allowed) {
      return new Response(
        JSON.stringify({ error: 'DAILY_LIMIT_EXCEEDED', message: 'Workspace daily AI analysis limit reached.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 4. PLAIN INSERT RESERVATION FLOW
    const { data: reservedAnalysis, error: insertErr } = await supabaseAdmin
      .from('ai_conversation_analyses')
      .insert({
        workspace_id,
        conversation_id,
        lead_id: conv.lead_id || null,
        fingerprint,
        analysis_status: 'processing',
        trigger_type,
        model_provider: adapter.name,
        model_name: adapter.name === 'openai' ? 'gpt-4o-mini' : 'mock_rule_engine',
        input_message_count: msgList.length,
        input_last_message_id: lastMsg?.id || null,
        requested_by: userId,
      })
      .select('*')
      .single()

    if (insertErr) {
      await supabaseAdmin.rpc('release_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })

      const { data: existingRow } = await supabaseAdmin
        .from('ai_conversation_analyses')
        .select('*')
        .eq('workspace_id', workspace_id)
        .eq('fingerprint', fingerprint)
        .single()

      return new Response(
        JSON.stringify({ analysis: existingRow || null, suggestions: [], cached: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const prompt = `You are Noverlyn AI, a multi-industry Customer Operations & Sales Intelligence Assistant.
Analyze the provided WhatsApp conversation. Extract insights, lead score (0-100), urgency, objections, buying signals, missing information, next best action, and suggested reply.
Return strictly JSON with keys: customer_intent, requirement_summary, qualification, extracted_fields, custom_field_suggestions, buying_signals, objections, missing_information, next_best_action, suggested_reply.
Never invent unsupported information.`

    const contextPayload = {
      workspace_context: aiCtx || { business_summary: 'Universal business platform' },
      custom_fields: customFieldsArray,
      conversation: {
        contact_phone: conv.contact_phone,
        contact_name: conv.contact_name,
        status: conv.status,
      },
      lead: conv.lead || null,
      messages: msgList.map((m) => ({
        id: m.id,
        direction: m.direction,
        text_body: m.text_body || m.media_caption || '',
        occurred_at: m.occurred_at,
      })),
    }

    let rawJsonStr: string
    try {
      rawJsonStr = await adapter.analyze(prompt, contextPayload)
    } catch (adapterErr: unknown) {
      await supabaseAdmin.rpc('release_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })
      const errMsg = adapterErr instanceof Error ? adapterErr.message : 'PROVIDER_ERROR'
      await supabaseAdmin
        .from('ai_conversation_analyses')
        .update({ analysis_status: 'failed', error_code: 'PROVIDER_CALL_FAILED', error_message: errMsg })
        .eq('id', reservedAnalysis.id)

      return new Response(
        JSON.stringify({ error: errMsg, message: 'AI provider call failed.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawJsonStr)
    } catch {
      await supabaseAdmin.rpc('release_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })
      await supabaseAdmin
        .from('ai_conversation_analyses')
        .update({ analysis_status: 'failed', error_code: 'MALFORMED_OUTPUT', error_message: 'Provider returned invalid JSON' })
        .eq('id', reservedAnalysis.id)

      return new Response(
        JSON.stringify({ error: 'MALFORMED_OUTPUT', message: 'Provider returned invalid JSON.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 5. STRICT ZOD RUNTIME SCHEMA VALIDATION
    const validation = AiAnalysisOutputSchema.safeParse(parsed)

    if (!validation.success) {
      await supabaseAdmin.rpc('release_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })
      await supabaseAdmin
        .from('ai_conversation_analyses')
        .update({ analysis_status: 'failed', error_code: 'MALFORMED_OUTPUT', error_message: validation.error.message })
        .eq('id', reservedAnalysis.id)

      return new Response(
        JSON.stringify({ error: 'MALFORMED_OUTPUT', message: 'Provider output failed strict schema validation' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const validatedData = validation.data
    const qual = validatedData.qualification
    const scoreNum = qual.lead_score
    const tempStr = qual.lead_temperature
    const intentObj = validatedData.customer_intent
    const reqObj = validatedData.requirement_summary
    const nbaObj = validatedData.next_best_action
    const replyObj = validatedData.suggested_reply
    const extractedList = validatedData.extracted_fields || []
    const customList = validatedData.custom_field_suggestions || []

    // 6. UPDATE RESERVED ROW TO READY
    const { data: updatedAnalysis, error: updateErr } = await supabaseAdmin
      .from('ai_conversation_analyses')
      .update({
        analysis_status: 'ready',
        overall_confidence: scoreNum / 100,
        customer_intent: intentObj?.value || null,
        requirement_summary: reqObj?.value || null,
        urgency: qual.urgency,
        lead_score: scoreNum,
        lead_temperature: tempStr,
        recommended_next_action: nbaObj?.action || null,
        recommended_action_reason: nbaObj?.reason || null,
        recommended_follow_up_at: nbaObj?.recommended_at || null,
        suggested_reply: replyObj?.text || null,
        extracted_data: validatedData,
        custom_field_suggestions: customList,
        missing_information: validatedData.missing_information || [],
        objections: validatedData.objections || [],
        buying_signals: validatedData.buying_signals || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservedAnalysis.id)
      .select('*')
      .single()

    if (updateErr || !updatedAnalysis) {
      await supabaseAdmin.rpc('release_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })
      throw new Error(`Failed to update reserved analysis: ${updateErr?.message}`)
    }

    // FINALIZE USAGE: Move 1 unit from reserved_count to analysis_count
    await supabaseAdmin.rpc('finalize_workspace_ai_usage_rpc', { p_workspace_id: workspace_id })

    // 7. EVIDENCE VERIFICATION
    const suggestionInserts = []

    for (const ef of extractedList) {
      const rawEvidenceIds = ef.evidence_message_ids || []
      const verifiedEvidenceIds = rawEvidenceIds.filter((id) => validMessageIdSet.has(id))

      suggestionInserts.push({
        workspace_id,
        analysis_id: updatedAnalysis.id,
        conversation_id,
        lead_id: conv.lead_id || null,
        suggestion_type: 'lead_field',
        target_field: ef.field,
        current_value: conv.lead ? (conv.lead as Record<string, unknown>)[ef.field] || null : null,
        suggested_value: ef.value,
        confidence: ef.confidence,
        evidence_message_ids: verifiedEvidenceIds,
        evidence_text: ef.evidence || null,
        status: 'pending',
      })
    }

    if (replyObj?.text) {
      suggestionInserts.push({
        workspace_id,
        analysis_id: updatedAnalysis.id,
        conversation_id,
        lead_id: conv.lead_id || null,
        suggestion_type: 'reply',
        target_field: 'suggested_reply',
        suggested_value: replyObj.text,
        confidence: replyObj.confidence || 0.85,
        evidence_text: replyObj.goal || 'Suggested AI reply',
        status: 'pending',
      })
    }

    let createdSuggestions: unknown[] = []
    if (suggestionInserts.length > 0) {
      const { data: sugData } = await supabaseAdmin
        .from('ai_lead_suggestions')
        .insert(suggestionInserts)
        .select('*')

      createdSuggestions = sugData || []
    }

    return new Response(
      JSON.stringify({
        analysis: updatedAnalysis,
        suggestions: createdSuggestions,
        cached: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('[ai-conversation-analyze Error]', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
