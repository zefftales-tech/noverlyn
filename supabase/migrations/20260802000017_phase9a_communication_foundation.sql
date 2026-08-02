-- ============================================================================
-- PHASE 9A — WHATSAPP COMMUNICATION FOUNDATION MIGRATION
-- Migration: 20260802000017_phase9a_communication_foundation.sql
-- ============================================================================

-- 1. ADD COMMUNICATION COLUMNS TO PUBLIC.LEADS
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_communication_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_incoming_message_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_outgoing_message_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS communication_status TEXT NOT NULL DEFAULT 'none';

-- Add check constraint for lead communication_status if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_communication_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_communication_status_check
      CHECK (communication_status IN ('none', 'awaiting_reply', 'needs_response', 'active', 'resolved'));
  END IF;
END $$;

-- 2. CREATE TABLE PUBLIC.LEAD_COMMUNICATIONS
CREATE TABLE IF NOT EXISTS public.lead_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  communication_status TEXT NOT NULL DEFAULT 'logged' CHECK (communication_status IN ('logged', 'sent', 'delivered', 'read', 'failed')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_to UUID NULL REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lead communications queries
CREATE INDEX IF NOT EXISTS idx_lead_communications_lead_id ON public.lead_communications(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_communications_workspace ON public.lead_communications(workspace_id);

-- 3. CREATE TABLE PUBLIC.MESSAGE_TEMPLATES
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_workspace ON public.message_templates(workspace_id, is_active);

-- 4. ROW LEVEL SECURITY POLICIES
ALTER TABLE public.lead_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_communications
DROP POLICY IF EXISTS "Users can view lead communications in their workspace" ON public.lead_communications;
CREATE POLICY "Users can view lead communications in their workspace"
  ON public.lead_communications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_communications.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can log lead communications in their workspace" ON public.lead_communications;
CREATE POLICY "Users can log lead communications in their workspace"
  ON public.lead_communications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_communications.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- RLS Policies for message_templates
DROP POLICY IF EXISTS "Users can view message templates in their workspace" ON public.message_templates;
CREATE POLICY "Users can view message templates in their workspace"
  ON public.message_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage message templates" ON public.message_templates;
CREATE POLICY "Owners and managers can manage message templates"
  ON public.message_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

-- 5. RPC FUNCTIONS FOR WHATSAPP COMMUNICATIONS

-- Log Lead Communication RPC
CREATE OR REPLACE FUNCTION public.log_lead_communication_rpc(
  p_lead_id UUID,
  p_direction TEXT,
  p_message TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT now(),
  p_schedule_followup TIMESTAMPTZ DEFAULT NULL,
  p_followup_type TEXT DEFAULT NULL,
  p_followup_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_lead RECORD;
  v_ws_id UUID;
  v_comm_id UUID;
  v_new_comm_status TEXT;
  v_assigned_agent UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate lead existence and workspace membership
  SELECT l.id, l.workspace_id, l.assigned_to, l.full_name
  INTO v_lead
  FROM public.leads l
  JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
  WHERE l.id = p_lead_id
    AND wm.user_id = v_user_id
    AND wm.status = 'active';

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or access denied';
  END IF;

  v_ws_id := v_lead.workspace_id;
  v_assigned_agent := v_lead.assigned_to;

  IF p_direction NOT IN ('incoming', 'outgoing') THEN
    RAISE EXCEPTION 'Invalid direction: must be incoming or outgoing';
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  -- Determine new communication status for lead
  IF p_direction = 'incoming' THEN
    v_new_comm_status := 'needs_response';
  ELSE
    v_new_comm_status := 'awaiting_reply';
  END IF;

  -- Insert communication record
  INSERT INTO public.lead_communications (
    workspace_id,
    lead_id,
    direction,
    channel,
    message,
    communication_status,
    occurred_at,
    logged_by,
    assigned_to
  ) VALUES (
    v_ws_id,
    p_lead_id,
    p_direction,
    'whatsapp',
    p_message,
    'logged',
    COALESCE(p_occurred_at, now()),
    v_user_id,
    v_assigned_agent
  ) RETURNING id INTO v_comm_id;

  -- Update lead metrics and timestamps
  UPDATE public.leads
  SET
    last_communication_at = COALESCE(p_occurred_at, now()),
    last_incoming_message_at = CASE WHEN p_direction = 'incoming' THEN COALESCE(p_occurred_at, now()) ELSE last_incoming_message_at END,
    last_outgoing_message_at = CASE WHEN p_direction = 'outgoing' THEN COALESCE(p_occurred_at, now()) ELSE last_outgoing_message_at END,
    communication_status = v_new_comm_status,
    updated_at = now()
  WHERE id = p_lead_id;

  -- Record activity
  INSERT INTO public.lead_activities (
    workspace_id,
    lead_id,
    actor_id,
    activity_type,
    activity_data
  ) VALUES (
    v_ws_id,
    p_lead_id,
    v_user_id,
    CASE WHEN p_direction = 'incoming' THEN 'whatsapp_incoming_logged' ELSE 'whatsapp_outgoing_logged' END,
    jsonb_build_object(
      'communication_id', v_comm_id,
      'direction', p_direction,
      'message_snippet', substring(p_message from 1 for 100)
    )
  );

  -- Schedule follow-up if requested
  IF p_schedule_followup IS NOT NULL THEN
    INSERT INTO public.follow_ups (
      workspace_id,
      lead_id,
      assigned_to,
      type,
      scheduled_at,
      status,
      notes,
      created_by
    ) VALUES (
      v_ws_id,
      p_lead_id,
      COALESCE(v_assigned_agent, v_user_id),
      COALESCE(p_followup_type, 'whatsapp'),
      p_schedule_followup,
      'scheduled',
      p_followup_notes,
      v_user_id
    );
  END IF;

  -- Create notification for assigned agent if incoming message
  IF p_direction = 'incoming' AND v_assigned_agent IS NOT NULL AND v_assigned_agent <> v_user_id THEN
    INSERT INTO public.notifications (
      workspace_id,
      user_id,
      lead_id,
      type,
      title,
      message
    ) VALUES (
      v_ws_id,
      v_assigned_agent,
      p_lead_id,
      'whatsapp_needs_response',
      'WhatsApp Message Needs Response',
      'Incoming WhatsApp message logged for lead ' || v_lead.full_name
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'communication_id', v_comm_id,
    'communication_status', v_new_comm_status
  );
END;
$$;

-- Update Lead Communication Status RPC
CREATE OR REPLACE FUNCTION public.update_lead_communication_status_rpc(
  p_lead_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_lead RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('none', 'awaiting_reply', 'needs_response', 'active', 'resolved') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  SELECT l.id, l.workspace_id, l.communication_status
  INTO v_lead
  FROM public.leads l
  JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
  WHERE l.id = p_lead_id
    AND wm.user_id = v_user_id
    AND wm.status = 'active';

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or access denied';
  END IF;

  UPDATE public.leads
  SET
    communication_status = p_status,
    updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_activities (
    workspace_id,
    lead_id,
    actor_id,
    activity_type,
    activity_data
  ) VALUES (
    v_lead.workspace_id,
    p_lead_id,
    v_user_id,
    'communication_status_changed',
    jsonb_build_object(
      'from_status', v_lead.communication_status,
      'to_status', p_status
    )
  );

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- Message Template Management RPCs
CREATE OR REPLACE FUNCTION public.create_message_template_rpc(
  p_workspace_id UUID,
  p_name TEXT,
  p_category TEXT,
  p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_template_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can create message templates';
  END IF;

  INSERT INTO public.message_templates (
    workspace_id,
    name,
    category,
    content,
    is_active,
    created_by
  ) VALUES (
    p_workspace_id,
    trim(p_name),
    COALESCE(p_category, 'general'),
    trim(p_content),
    true,
    v_user_id
  ) RETURNING id INTO v_template_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_message_template_rpc(
  p_template_id UUID,
  p_name TEXT,
  p_category TEXT,
  p_content TEXT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_ws_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_ws_id
  FROM public.message_templates
  WHERE id = p_template_id;

  IF v_ws_id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_ws_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can update message templates';
  END IF;

  UPDATE public.message_templates
  SET
    name = trim(p_name),
    category = COALESCE(p_category, 'general'),
    content = trim(p_content),
    is_active = COALESCE(p_is_active, true),
    updated_at = now()
  WHERE id = p_template_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_message_template_rpc(
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_ws_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_ws_id
  FROM public.message_templates
  WHERE id = p_template_id;

  IF v_ws_id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_ws_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can delete message templates';
  END IF;

  DELETE FROM public.message_templates WHERE id = p_template_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant EXECUTE privileges to anon and authenticated
GRANT EXECUTE ON FUNCTION public.log_lead_communication_rpc(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_lead_communication_status_rpc(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_message_template_rpc(UUID, TEXT, TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_message_template_rpc(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.delete_message_template_rpc(UUID) TO authenticated, anon;
