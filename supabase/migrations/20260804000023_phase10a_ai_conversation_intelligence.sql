-- ============================================================================
-- PHASE 10A — AI CONVERSATION INTELLIGENCE FOUNDATION
-- Migration: 20260804000023_phase10a_ai_conversation_intelligence.sql
-- Includes atomic usage reservation (reserve, release, finalize), workspace_ai_context,
-- ai_conversation_analyses, ai_lead_suggestions, and apply_ai_conversation_suggestions_rpc.
-- ============================================================================

-- 1. CREATE TABLE PUBLIC.WORKSPACE_AI_USAGE
CREATE TABLE IF NOT EXISTS public.workspace_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  analysis_count INTEGER NOT NULL DEFAULT 0,
  reserved_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_ai_usage UNIQUE (workspace_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_workspace_ai_usage_ws ON public.workspace_ai_usage(workspace_id, usage_date);

-- 2. CREATE TABLE PUBLIC.WORKSPACE_AI_CONTEXT
CREATE TABLE IF NOT EXISTS public.workspace_ai_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_summary TEXT NULL,
  products_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualification_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  reply_tone TEXT NOT NULL DEFAULT 'professional',
  restricted_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_instructions TEXT NULL,
  trigger_mode TEXT NOT NULL DEFAULT 'manual_only' CHECK (trigger_mode IN ('off', 'manual_only', 'important_messages', 'every_incoming_message')),
  daily_analysis_limit INTEGER NOT NULL DEFAULT 50,
  cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_ai_ctx_ws ON public.workspace_ai_context(workspace_id);

-- 3. CREATE TABLE PUBLIC.AI_CONVERSATION_ANALYSES
CREATE TABLE IF NOT EXISTS public.ai_conversation_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  fingerprint TEXT NOT NULL,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'ready', 'partially_approved', 'approved', 'dismissed', 'failed', 'outdated')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'incoming_message', 'conversation_opened', 'lead_review', 'scheduled')),
  model_provider TEXT NULL,
  model_name TEXT NULL,
  input_message_count INTEGER NOT NULL DEFAULT 0,
  input_last_message_id UUID NULL,
  analysis_version TEXT NOT NULL DEFAULT '1',
  overall_confidence NUMERIC NULL,
  customer_intent TEXT NULL,
  requirement_summary TEXT NULL,
  urgency TEXT NULL,
  lead_score INTEGER NULL CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_temperature TEXT NULL CHECK (lead_temperature IN ('hot', 'warm', 'cold', 'unknown')),
  recommended_next_action TEXT NULL,
  recommended_action_reason TEXT NULL,
  recommended_follow_up_at TIMESTAMPTZ NULL,
  suggested_reply TEXT NULL,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_field_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  objections JSONB NOT NULL DEFAULT '[]'::jsonb,
  buying_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT NULL,
  error_message TEXT NULL,
  requested_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_conv ON public.ai_conversation_analyses(conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analyses_unique_fp ON public.ai_conversation_analyses(workspace_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_lead ON public.ai_conversation_analyses(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_analyses_status ON public.ai_conversation_analyses(workspace_id, analysis_status);

-- 4. CREATE TABLE PUBLIC.AI_LEAD_SUGGESTIONS
CREATE TABLE IF NOT EXISTS public.ai_lead_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES public.ai_conversation_analyses(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('lead_field', 'custom_field', 'qualification', 'next_action', 'follow_up', 'reply', 'missing_information', 'objection', 'buying_signal')),
  target_field TEXT NULL,
  target_custom_field_id UUID NULL,
  current_value JSONB NULL,
  suggested_value JSONB NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_text TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded', 'applied')),
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_analysis ON public.ai_lead_suggestions(analysis_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON public.ai_lead_suggestions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conv ON public.ai_lead_suggestions(conversation_id);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE public.workspace_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_ai_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_lead_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS: workspace_ai_context
DROP POLICY IF EXISTS "Owners and managers can manage workspace_ai_context" ON public.workspace_ai_context;
DROP POLICY IF EXISTS "Agents can view workspace_ai_context" ON public.workspace_ai_context;

CREATE POLICY "Owners and managers can manage workspace_ai_context"
  ON public.workspace_ai_context FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_ai_context.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

CREATE POLICY "Agents can view workspace_ai_context"
  ON public.workspace_ai_context FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_ai_context.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- RLS: ai_conversation_analyses
DROP POLICY IF EXISTS "Owners and managers can view all workspace analyses" ON public.ai_conversation_analyses;
DROP POLICY IF EXISTS "Agents can view assigned conversation analyses" ON public.ai_conversation_analyses;
DROP POLICY IF EXISTS "Workspace members can update accessible analyses" ON public.ai_conversation_analyses;

CREATE POLICY "Owners and managers can view all workspace analyses"
  ON public.ai_conversation_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_conversation_analyses.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

CREATE POLICY "Agents can view assigned conversation analyses"
  ON public.ai_conversation_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations wc
      WHERE wc.id = ai_conversation_analyses.conversation_id
        AND (
          wc.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ai_conversation_analyses.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'manager')
              AND wm.status = 'active'
          )
        )
    )
  );

CREATE POLICY "Workspace members can update accessible analyses"
  ON public.ai_conversation_analyses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_conversation_analyses.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- RLS: ai_lead_suggestions
DROP POLICY IF EXISTS "Owners and managers can view all workspace suggestions" ON public.ai_lead_suggestions;
DROP POLICY IF EXISTS "Agents can view assigned conversation suggestions" ON public.ai_lead_suggestions;
DROP POLICY IF EXISTS "Workspace members can update accessible suggestions" ON public.ai_lead_suggestions;

CREATE POLICY "Owners and managers can view all workspace suggestions"
  ON public.ai_lead_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_lead_suggestions.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

CREATE POLICY "Agents can view assigned conversation suggestions"
  ON public.ai_lead_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations wc
      WHERE wc.id = ai_lead_suggestions.conversation_id
        AND (
          wc.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ai_lead_suggestions.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'manager')
              AND wm.status = 'active'
          )
        )
    )
  );

CREATE POLICY "Workspace members can update accessible suggestions"
  ON public.ai_lead_suggestions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_lead_suggestions.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- 6. ATOMIC USAGE LIFECYCLE RPCs (Reserve, Release, Finalize)

CREATE OR REPLACE FUNCTION public.reserve_workspace_ai_usage_rpc(
  p_workspace_id UUID,
  p_daily_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_current_count INT;
BEGIN
  INSERT INTO public.workspace_ai_usage (workspace_id, usage_date, analysis_count, reserved_count, updated_at)
  VALUES (p_workspace_id, v_today, 0, 1, now())
  ON CONFLICT (workspace_id, usage_date) DO UPDATE
  SET
    reserved_count = public.workspace_ai_usage.reserved_count + 1,
    updated_at = now()
  WHERE (public.workspace_ai_usage.reserved_count + public.workspace_ai_usage.analysis_count) < p_daily_limit
  RETURNING (analysis_count + reserved_count) INTO v_current_count;

  IF v_current_count IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'DAILY_LIMIT_EXCEEDED');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'current_count', v_current_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_workspace_ai_usage_rpc(
  p_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.workspace_ai_usage
  SET reserved_count = GREATEST(0, reserved_count - 1), updated_at = now()
  WHERE workspace_id = p_workspace_id AND usage_date = CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_workspace_ai_usage_rpc(
  p_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.workspace_ai_usage
  SET
    reserved_count = GREATEST(0, reserved_count - 1),
    analysis_count = analysis_count + 1,
    updated_at = now()
  WHERE workspace_id = p_workspace_id AND usage_date = CURRENT_DATE;
END;
$$;

-- 7. SECURE SUGGESTION APPROVAL RPC

CREATE OR REPLACE FUNCTION public.apply_ai_conversation_suggestions_rpc(
  p_analysis_id UUID,
  p_suggestion_ids UUID[],
  p_create_follow_up BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_ws_id UUID;
  v_conv_id UUID;
  v_lead_id UUID;
  v_analysis RECORD;
  v_latest_msg_id UUID;
  v_sug RECORD;
  v_lead RECORD;
  v_applied_count INT := 0;
  v_conflict_count INT := 0;
  v_target_field TEXT;
  v_sug_val JSONB;
  v_curr_val JSONB;
  v_val_text TEXT;
  v_val_num NUMERIC;
  v_budget_min NUMERIC;
  v_budget_max NUMERIC;
  v_note_content TEXT := 'AI Suggestions Approved:' || E'\n';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_analysis
  FROM public.ai_conversation_analyses
  WHERE id = p_analysis_id
  FOR UPDATE;

  IF v_analysis.id IS NULL THEN RAISE EXCEPTION 'Analysis not found'; END IF;

  v_ws_id := v_analysis.workspace_id;
  v_conv_id := v_analysis.conversation_id;
  v_lead_id := v_analysis.lead_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_ws_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied to workspace';
  END IF;

  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads
    WHERE id = v_lead_id AND workspace_id = v_ws_id AND deleted_at IS NULL AND archived_at IS NULL;

    IF v_lead.id IS NULL THEN
      RAISE EXCEPTION 'Lead is deleted, archived, or not found in this workspace';
    END IF;
  END IF;

  SELECT id INTO v_latest_msg_id
  FROM public.whatsapp_messages
  WHERE conversation_id = v_conv_id
  ORDER BY occurred_at DESC, created_at DESC
  LIMIT 1;

  IF v_latest_msg_id IS NOT NULL AND v_analysis.input_last_message_id IS NOT NULL AND v_latest_msg_id != v_analysis.input_last_message_id THEN
    UPDATE public.ai_conversation_analyses SET analysis_status = 'outdated', updated_at = now() WHERE id = p_analysis_id;
    RAISE EXCEPTION 'Analysis is outdated due to newer conversation messages. Re-analysis required.';
  END IF;

  FOR v_sug IN
    SELECT * FROM public.ai_lead_suggestions
    WHERE id = ANY(p_suggestion_ids)
      AND analysis_id = p_analysis_id
      AND status = 'pending'
    FOR UPDATE
  LOOP
    v_target_field := v_sug.target_field;
    v_sug_val := v_sug.suggested_value;
    v_curr_val := v_sug.current_value;

    IF v_sug.suggestion_type = 'lead_field' AND v_lead_id IS NOT NULL THEN
      IF v_target_field = 'full_name' THEN
        IF v_curr_val IS NOT NULL AND (v_curr_val #>> '{}') != v_lead.full_name THEN
          UPDATE public.ai_lead_suggestions SET status = 'superseded' WHERE id = v_sug.id;
          v_conflict_count := v_conflict_count + 1;
          CONTINUE;
        END IF;

        v_val_text := trim(COALESCE(v_sug_val #>> '{}', ''));
        IF v_val_text <> '' THEN
          UPDATE public.leads SET full_name = v_val_text, updated_at = now() WHERE id = v_lead_id;
          v_applied_count := v_applied_count + 1;
          v_note_content := v_note_content || '- Full Name: ' || v_val_text || E'\n';
        END IF;

      ELSIF v_target_field = 'requirement' THEN
        v_val_text := trim(COALESCE(v_sug_val #>> '{}', ''));
        IF v_val_text <> '' THEN
          UPDATE public.leads SET requirement = v_val_text, updated_at = now() WHERE id = v_lead_id;
          v_applied_count := v_applied_count + 1;
          v_note_content := v_note_content || '- Requirement: ' || v_val_text || E'\n';
        END IF;

      ELSIF v_target_field = 'budget_min' THEN
        v_val_num := (v_sug_val #>> '{}')::numeric;
        IF v_val_num >= 0 THEN
          SELECT budget_max INTO v_budget_max FROM public.leads WHERE id = v_lead_id;
          IF v_budget_max IS NULL OR v_val_num <= v_budget_max THEN
            UPDATE public.leads SET budget_min = v_val_num, updated_at = now() WHERE id = v_lead_id;
            v_applied_count := v_applied_count + 1;
            v_note_content := v_note_content || '- Min Budget: ' || v_val_num || E'\n';
          END IF;
        END IF;

      ELSIF v_target_field = 'budget_max' THEN
        v_val_num := (v_sug_val #>> '{}')::numeric;
        IF v_val_num >= 0 THEN
          SELECT budget_min INTO v_budget_min FROM public.leads WHERE id = v_lead_id;
          IF v_budget_min IS NULL OR v_val_num >= v_budget_min THEN
            UPDATE public.leads SET budget_max = v_val_num, updated_at = now() WHERE id = v_lead_id;
            v_applied_count := v_applied_count + 1;
            v_note_content := v_note_content || '- Max Budget: ' || v_val_num || E'\n';
          END IF;
        END IF;

      ELSIF v_target_field = 'stage' THEN
        v_val_text := lower(trim(COALESCE(v_sug_val #>> '{}', '')));
        IF v_val_text IN ('new', 'contacted', 'qualified', 'property_shared', 'viewing_scheduled', 'negotiation') THEN
          UPDATE public.leads SET stage = v_val_text, updated_at = now() WHERE id = v_lead_id;
          v_applied_count := v_applied_count + 1;
          v_note_content := v_note_content || '- Stage: ' || v_val_text || E'\n';
        END IF;

      ELSIF v_target_field = 'priority' THEN
        v_val_text := lower(trim(COALESCE(v_sug_val #>> '{}', '')));
        IF v_val_text IN ('hot', 'warm', 'cold') THEN
          UPDATE public.leads SET priority = v_val_text, updated_at = now() WHERE id = v_lead_id;
          v_applied_count := v_applied_count + 1;
          v_note_content := v_note_content || '- Priority: ' || v_val_text || E'\n';
        END IF;
      END IF;

    ELSIF v_sug.suggestion_type = 'custom_field' AND v_lead_id IS NOT NULL THEN
      UPDATE public.leads
      SET public_form_data = jsonb_set(
        COALESCE(public_form_data, '{}'::jsonb),
        ARRAY[v_target_field],
        v_sug_val
      ),
      updated_at = now()
      WHERE id = v_lead_id;

      v_applied_count := v_applied_count + 1;
      v_note_content := v_note_content || '- Custom Field [' || v_target_field || ']: ' || COALESCE(v_sug_val #>> '{}', 'Updated') || E'\n';
    ELSE
      v_applied_count := v_applied_count + 1;
      v_note_content := v_note_content || '- ' || v_sug.suggestion_type || ': ' || COALESCE(v_sug_val #>> '{}', 'Approved') || E'\n';
    END IF;

    UPDATE public.ai_lead_suggestions
    SET status = 'applied', reviewed_by = v_user_id, reviewed_at = now()
    WHERE id = v_sug.id;
  END LOOP;

  IF p_create_follow_up AND v_lead_id IS NOT NULL AND v_analysis.recommended_follow_up_at IS NOT NULL THEN
    IF v_analysis.recommended_follow_up_at > now() THEN
      INSERT INTO public.follow_ups (
        workspace_id,
        lead_id,
        assigned_to,
        type,
        scheduled_at,
        status,
        notes,
        created_by,
        created_at
      ) VALUES (
        v_ws_id,
        v_lead_id,
        COALESCE(v_lead.assigned_to, v_user_id),
        'call',
        v_analysis.recommended_follow_up_at,
        'pending',
        COALESCE(v_analysis.recommended_next_action, 'AI Recommended Follow-up'),
        v_user_id,
        now()
      );
    END IF;
  END IF;

  IF v_lead_id IS NOT NULL AND v_applied_count > 0 THEN
    INSERT INTO public.lead_notes (
      workspace_id,
      lead_id,
      author_user_id,
      content,
      created_at,
      updated_at
    ) VALUES (
      v_ws_id,
      v_lead_id,
      v_user_id,
      v_note_content,
      now(),
      now()
    );
  END IF;

  UPDATE public.ai_conversation_analyses
  SET
    analysis_status = CASE WHEN v_applied_count > 0 THEN 'approved' ELSE analysis_status END,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_analysis_id;

  RETURN jsonb_build_object(
    'success', true,
    'analysis_id', p_analysis_id,
    'applied_count', v_applied_count,
    'conflict_count', v_conflict_count,
    'lead_id', v_lead_id
  );
END;
$$;

-- Explicit Security Revokes & Grants
REVOKE ALL ON FUNCTION public.reserve_workspace_ai_usage_rpc(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_workspace_ai_usage_rpc(UUID, INT) TO authenticated;

REVOKE ALL ON FUNCTION public.release_workspace_ai_usage_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_workspace_ai_usage_rpc(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_workspace_ai_usage_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_ai_usage_rpc(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_ai_conversation_suggestions_rpc(UUID, UUID[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_ai_conversation_suggestions_rpc(UUID, UUID[], BOOLEAN) TO authenticated;
