-- ============================================================================
-- PHASE 9B.2 — CORRECTIVE MIGRATION
-- Migration: 20260804000022_fix_whatsapp_create_lead_columns.sql
-- Fixes lead insertion error "column name of relation leads does not exist"
-- Replaces invalid column 'name' with live schema column 'full_name' and
-- normalizes stage and priority values to match table check constraints.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_lead_from_whatsapp_review_rpc(
  p_review_id UUID,
  p_lead_name TEXT,
  p_assigned_to UUID DEFAULT NULL,
  p_stage TEXT DEFAULT 'new',
  p_priority TEXT DEFAULT 'warm',
  p_initial_note TEXT DEFAULT NULL
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- 1. Lock review row FOR UPDATE to prevent double processing
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

  -- 3. Validate assignment user if provided
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

  -- 4. Normalize stage (CHECK: 'new', 'contacted', 'qualified', 'property_shared', 'viewing_scheduled', 'negotiation', 'won', 'lost')
  v_clean_stage := lower(trim(COALESCE(p_stage, 'new')));
  IF v_clean_stage NOT IN ('new', 'contacted', 'qualified', 'property_shared', 'viewing_scheduled', 'negotiation', 'won', 'lost') THEN
    v_clean_stage := 'new';
  END IF;

  -- 5. Normalize priority (CHECK: 'hot', 'warm', 'cold')
  v_clean_priority := lower(trim(COALESCE(p_priority, 'warm')));
  IF v_clean_priority = 'medium' THEN
    v_clean_priority := 'warm';
  ELSIF v_clean_priority NOT IN ('hot', 'warm', 'cold') THEN
    v_clean_priority := 'warm';
  END IF;

  -- 6. Insert new Lead using live schema columns (full_name NOT name)
  INSERT INTO public.leads (
    workspace_id,
    full_name,
    phone,
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

  -- 9. Insert initial note if provided
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
    'conversation_id', v_review.conversation_id
  );
END;
$$;

-- Security Grants
REVOKE ALL ON FUNCTION public.create_lead_from_whatsapp_review_rpc(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lead_from_whatsapp_review_rpc(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
