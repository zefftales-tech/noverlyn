-- ============================================================================
-- PHASE 10B — PROFESSIONAL AI LEAD QUALIFICATION & REPLY WORKFLOW
-- Migration: 20260805000025_phase10b_ai_qualification_reply_workflow.sql
-- 1. Adds reply_automation_mode column to workspace_ai_context
-- 2. Upgrades create_lead_from_whatsapp_review_rpc for atomic standard/custom field lead creation
-- ============================================================================

-- 1. Add reply_automation_mode to workspace_ai_context
ALTER TABLE public.workspace_ai_context
ADD COLUMN IF NOT EXISTS reply_automation_mode TEXT NOT NULL DEFAULT 'suggest_only'
CHECK (reply_automation_mode IN ('disabled', 'suggest_only', 'auto_qualification'));

-- 2. Drop obsolete create_lead_from_whatsapp_review_rpc signatures
DROP FUNCTION IF EXISTS public.create_lead_from_whatsapp_review_rpc(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT
);

-- 3. Atomic Lead Creation RPC with Standard Fields, Custom Fields (public_form_data), and AI Suggestion Linking
CREATE OR REPLACE FUNCTION public.create_lead_from_whatsapp_review_rpc(
  p_review_id UUID,
  p_lead_name TEXT,
  p_assigned_to UUID DEFAULT NULL,
  p_stage TEXT DEFAULT 'new',
  p_priority TEXT DEFAULT 'warm',
  p_initial_note TEXT DEFAULT NULL,
  p_requirement TEXT DEFAULT NULL,
  p_budget_min NUMERIC DEFAULT NULL,
  p_budget_max NUMERIC DEFAULT NULL,
  p_public_form_data JSONB DEFAULT '{}'::jsonb,
  p_analysis_id UUID DEFAULT NULL,
  p_approved_suggestion_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_review RECORD;
  v_lead_id UUID;
  v_assigned_user UUID;
  v_clean_stage TEXT;
  v_clean_priority TEXT;
  v_sug RECORD;
  v_applied_sug_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- 1. Lock review row FOR UPDATE
  SELECT * INTO v_review
  FROM public.whatsapp_contact_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF v_review.id IS NULL THEN RAISE EXCEPTION 'Contact review not found'; END IF;

  IF v_review.status != 'pending' THEN
    RAISE EXCEPTION 'Contact review is no longer pending (current status: %)', v_review.status;
  END IF;

  -- 2. Validate user role
  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_review.workspace_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can approve contact reviews';
  END IF;

  -- 3. Validate assigned agent if provided
  IF p_assigned_to IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = v_review.workspace_id AND user_id = p_assigned_to AND status = 'active'
    ) THEN
      v_assigned_user := p_assigned_to;
    ELSE
      RAISE EXCEPTION 'Assigned user must be an active member of this workspace';
    END IF;
  ELSE
    v_assigned_user := v_user_id;
  END IF;

  -- 4. Normalize stage
  v_clean_stage := lower(trim(COALESCE(p_stage, 'new')));
  IF v_clean_stage NOT IN ('new', 'contacted', 'qualified', 'property_shared', 'viewing_scheduled', 'negotiation', 'won', 'lost') THEN
    v_clean_stage := 'new';
  END IF;

  -- 5. Normalize priority
  v_clean_priority := lower(trim(COALESCE(p_priority, 'warm')));
  IF v_clean_priority = 'medium' THEN
    v_clean_priority := 'warm';
  ELSIF v_clean_priority NOT IN ('hot', 'warm', 'cold') THEN
    v_clean_priority := 'warm';
  END IF;

  -- 6. Insert Lead atomically with full standard & custom field payload
  INSERT INTO public.leads (
    workspace_id,
    full_name,
    phone,
    requirement,
    budget_min,
    budget_max,
    public_form_data,
    source,
    stage,
    priority,
    status,
    assigned_to,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_review.workspace_id,
    trim(p_lead_name),
    v_review.contact_phone,
    NULLIF(trim(p_requirement), ''),
    p_budget_min,
    p_budget_max,
    COALESCE(p_public_form_data, '{}'::jsonb),
    'WhatsApp',
    v_clean_stage,
    v_clean_priority,
    'active',
    v_assigned_user,
    v_user_id,
    now(),
    now()
  )
  RETURNING id INTO v_lead_id;

  -- 7. Update review record
  UPDATE public.whatsapp_contact_reviews
  SET
    status = 'approved',
    reviewed_by = v_user_id,
    reviewed_at = now(),
    approved_lead_id = v_lead_id,
    updated_at = now()
  WHERE id = p_review_id;

  -- 8. Link conversation and messages to new lead
  UPDATE public.whatsapp_conversations
  SET
    lead_id = v_lead_id,
    assigned_to = v_assigned_user,
    updated_at = now()
  WHERE id = v_review.conversation_id;

  UPDATE public.whatsapp_messages
  SET lead_id = v_lead_id
  WHERE conversation_id = v_review.conversation_id;

  -- 9. Mark approved AI suggestions as applied and link to lead
  IF p_approved_suggestion_ids IS NOT NULL AND array_length(p_approved_suggestion_ids, 1) > 0 THEN
    UPDATE public.ai_lead_suggestions
    SET
      status = 'applied',
      lead_id = v_lead_id,
      reviewed_by = v_user_id,
      reviewed_at = now()
    WHERE id = ANY(p_approved_suggestion_ids);

    GET DIAGNOSTICS v_applied_sug_count = ROW_COUNT;
  END IF;

  -- 10. Link analysis to lead if analysis_id provided
  IF p_analysis_id IS NOT NULL THEN
    UPDATE public.ai_conversation_analyses
    SET
      lead_id = v_lead_id,
      analysis_status = CASE WHEN analysis_status = 'ready' THEN 'approved' ELSE analysis_status END,
      reviewed_by = v_user_id,
      reviewed_at = now(),
      updated_at = now()
    WHERE id = p_analysis_id;
  END IF;

  -- 11. Insert initial note if provided
  IF p_initial_note IS NOT NULL AND trim(p_initial_note) <> '' THEN
    INSERT INTO public.lead_notes (
      workspace_id,
      lead_id,
      author_user_id,
      content,
      created_at,
      updated_at
    ) VALUES (
      v_review.workspace_id,
      v_lead_id,
      v_user_id,
      trim(p_initial_note),
      now(),
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'applied_suggestions_count', v_applied_sug_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_lead_from_whatsapp_review_rpc(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, UUID, UUID[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_lead_from_whatsapp_review_rpc(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, UUID, UUID[]
) TO authenticated;
