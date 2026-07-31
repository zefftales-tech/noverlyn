-- Noverlyn Phase 5.5 Migration: Core Vertical Templates & Dynamic Pipeline Stages
-- Timestamp: 20260731000010

-------------------------------------------------------
-- 1. WORKSPACES BUSINESS TYPE COLUMN
-------------------------------------------------------
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'real_estate';

ALTER TABLE public.workspaces
DROP CONSTRAINT IF EXISTS check_workspaces_business_type;

ALTER TABLE public.workspaces
ADD CONSTRAINT check_workspaces_business_type
CHECK (business_type IN ('real_estate', 'agency', 'home_services', 'general'));

-------------------------------------------------------
-- 2. PIPELINE STAGES TABLE
-------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_won BOOLEAN NOT NULL DEFAULT FALSE,
    is_lost BOOLEAN NOT NULL DEFAULT FALSE,
    requires_next_action BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_workspace_stage_key UNIQUE (workspace_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace
    ON public.pipeline_stages(workspace_id, position);

-------------------------------------------------------
-- 3. REMOVE HARDCODED LEADS STAGE CHECK CONSTRAINT
-------------------------------------------------------
ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_stage_check;

-------------------------------------------------------
-- 4. SEED PIPELINE STAGES HELPER FUNCTION
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_workspace_pipeline_stages(
    p_workspace_id UUID,
    p_business_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_business_type = 'agency' THEN
        INSERT INTO public.pipeline_stages (workspace_id, stage_key, label, position, is_won, is_lost, requires_next_action) VALUES
        (p_workspace_id, 'new', 'New Lead', 1, FALSE, FALSE, FALSE),
        (p_workspace_id, 'contacted', 'Contacted', 2, FALSE, FALSE, FALSE),
        (p_workspace_id, 'qualified', 'Qualified', 3, FALSE, FALSE, FALSE),
        (p_workspace_id, 'discovery', 'Discovery', 4, FALSE, FALSE, FALSE),
        (p_workspace_id, 'proposal', 'Proposal Sent', 5, FALSE, FALSE, TRUE),
        (p_workspace_id, 'negotiation', 'Negotiation', 6, FALSE, FALSE, TRUE),
        (p_workspace_id, 'won', 'Won', 7, TRUE, FALSE, FALSE),
        (p_workspace_id, 'lost', 'Lost', 8, FALSE, TRUE, FALSE)
        ON CONFLICT (workspace_id, stage_key) DO NOTHING;

    ELSIF p_business_type = 'home_services' THEN
        INSERT INTO public.pipeline_stages (workspace_id, stage_key, label, position, is_won, is_lost, requires_next_action) VALUES
        (p_workspace_id, 'new', 'New Lead', 1, FALSE, FALSE, FALSE),
        (p_workspace_id, 'contacted', 'Contacted', 2, FALSE, FALSE, FALSE),
        (p_workspace_id, 'qualified', 'Qualified', 3, FALSE, FALSE, FALSE),
        (p_workspace_id, 'estimate_sent', 'Estimate Sent', 4, FALSE, FALSE, TRUE),
        (p_workspace_id, 'scheduled', 'Job Scheduled', 5, FALSE, FALSE, FALSE),
        (p_workspace_id, 'in_progress', 'In Progress', 6, FALSE, FALSE, FALSE),
        (p_workspace_id, 'won', 'Won', 7, TRUE, FALSE, FALSE),
        (p_workspace_id, 'lost', 'Lost', 8, FALSE, TRUE, FALSE)
        ON CONFLICT (workspace_id, stage_key) DO NOTHING;

    ELSIF p_business_type = 'general' THEN
        INSERT INTO public.pipeline_stages (workspace_id, stage_key, label, position, is_won, is_lost, requires_next_action) VALUES
        (p_workspace_id, 'new', 'New Lead', 1, FALSE, FALSE, FALSE),
        (p_workspace_id, 'contacted', 'Contacted', 2, FALSE, FALSE, FALSE),
        (p_workspace_id, 'qualified', 'Qualified', 3, FALSE, FALSE, FALSE),
        (p_workspace_id, 'proposal', 'Proposal', 4, FALSE, FALSE, TRUE),
        (p_workspace_id, 'negotiation', 'Negotiation', 5, FALSE, FALSE, TRUE),
        (p_workspace_id, 'won', 'Won', 6, TRUE, FALSE, FALSE),
        (p_workspace_id, 'lost', 'Lost', 7, FALSE, TRUE, FALSE)
        ON CONFLICT (workspace_id, stage_key) DO NOTHING;

    ELSE
        -- REAL ESTATE (Default)
        INSERT INTO public.pipeline_stages (workspace_id, stage_key, label, position, is_won, is_lost, requires_next_action) VALUES
        (p_workspace_id, 'new', 'New Lead', 1, FALSE, FALSE, FALSE),
        (p_workspace_id, 'contacted', 'Contacted', 2, FALSE, FALSE, FALSE),
        (p_workspace_id, 'qualified', 'Qualified', 3, FALSE, FALSE, FALSE),
        (p_workspace_id, 'property_shared', 'Property Shared', 4, FALSE, FALSE, FALSE),
        (p_workspace_id, 'viewing_scheduled', 'Viewing Scheduled', 5, FALSE, FALSE, FALSE),
        (p_workspace_id, 'negotiation', 'Negotiation', 6, FALSE, FALSE, TRUE),
        (p_workspace_id, 'won', 'Won', 7, TRUE, FALSE, FALSE),
        (p_workspace_id, 'lost', 'Lost', 8, FALSE, TRUE, FALSE)
        ON CONFLICT (workspace_id, stage_key) DO NOTHING;
    END IF;
END;
$$;

-------------------------------------------------------
-- 5. SEED ALL EXISTING WORKSPACES
-------------------------------------------------------
DO $$
DECLARE
    v_ws RECORD;
BEGIN
    FOR v_ws IN SELECT id, business_type FROM public.workspaces LOOP
        PERFORM public.seed_workspace_pipeline_stages(v_ws.id, v_ws.business_type);
    END LOOP;
END;
$$;

-------------------------------------------------------
-- 6. UPDATE CREATE_WORKSPACE RPC (Accept Business Type)
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace(
    p_name TEXT,
    p_slug TEXT,
    p_timezone TEXT DEFAULT 'UTC',
    p_currency TEXT DEFAULT 'USD',
    p_business_type TEXT DEFAULT 'real_estate'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_clean_slug TEXT;
    v_workspace_id UUID;
    v_workspace_record RECORD;
    v_clean_btype TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a workspace';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Workspace name cannot be empty';
    END IF;

    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RAISE EXCEPTION 'Workspace slug cannot be empty';
    END IF;

    v_clean_slug := lower(trim(p_slug));
    v_clean_btype := lower(trim(COALESCE(p_business_type, 'real_estate')));
    IF v_clean_btype NOT IN ('real_estate', 'agency', 'home_services', 'general') THEN
        v_clean_btype := 'real_estate';
    END IF;

    IF EXISTS (SELECT 1 FROM public.workspaces WHERE lower(slug) = v_clean_slug) THEN
        RAISE EXCEPTION 'Workspace slug "%" is already taken. Please choose another.', trim(p_slug);
    END IF;

    -- 1. Insert Workspace
    INSERT INTO public.workspaces (name, slug, owner_user_id, timezone, currency, business_type)
    VALUES (trim(p_name), v_clean_slug, v_user_id, p_timezone, p_currency, v_clean_btype)
    RETURNING id INTO v_workspace_id;

    -- 2. Insert Workspace Owner Member
    INSERT INTO public.workspace_members (workspace_id, user_id, role, status, joined_at)
    VALUES (v_workspace_id, v_user_id, 'owner', 'active', NOW());

    -- 3. Insert Workspace Settings
    INSERT INTO public.workspace_settings (workspace_id, timezone, currency)
    VALUES (v_workspace_id, p_timezone, p_currency);

    -- 4. Seed Workspace Pipeline Stages
    PERFORM public.seed_workspace_pipeline_stages(v_workspace_id, v_clean_btype);

    -- Return created workspace record
    SELECT id, name, slug, owner_user_id, timezone, currency, business_type, created_at
    INTO v_workspace_record
    FROM public.workspaces
    WHERE id = v_workspace_id;

    RETURN to_jsonb(v_workspace_record);
END;
$$;

-------------------------------------------------------
-- 7. UPDATE CHANGE_LEAD_STAGE_RPC (Dynamic Stage Validation)
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_lead_stage_rpc(
    p_lead_id UUID,
    p_new_stage TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead public.leads%ROWTYPE;
    v_stage RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    IF NOT public.is_active_workspace_member(v_lead.workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Validate stage exists in workspace pipeline_stages
    SELECT * INTO v_stage FROM public.pipeline_stages
    WHERE workspace_id = v_lead.workspace_id AND stage_key = p_new_stage;

    IF v_stage.id IS NULL THEN
        RAISE EXCEPTION 'Invalid stage "%" for this workspace', p_new_stage;
    END IF;

    -- If moving to Lost, verify lost_reason is set or require mark_lead_lost_rpc
    IF v_stage.is_lost AND (v_lead.lost_reason IS NULL OR v_lead.lost_reason = '') THEN
        RAISE EXCEPTION 'Lost stage requires mark_lead_lost_rpc with a mandatory lost reason';
    END IF;

    -- Update lead stage and won/lost timestamp semantics
    UPDATE public.leads
    SET stage = p_new_stage,
        status = CASE
            WHEN v_stage.is_won THEN 'won'
            WHEN v_stage.is_lost THEN 'lost'
            ELSE 'active'
        END,
        won_at = CASE WHEN v_stage.is_won THEN COALESCE(won_at, NOW()) ELSE NULL END,
        lost_at = CASE WHEN v_stage.is_lost THEN COALESCE(lost_at, NOW()) ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;

    -- Log stage change activity
    INSERT INTO public.activities (
        workspace_id, lead_id, actor_user_id, activity_type, metadata
    )
    VALUES (
        v_lead.workspace_id,
        v_lead.id,
        v_caller_id,
        'stage_change',
        jsonb_build_object('new_stage', p_new_stage, 'stage_label', v_stage.label)
    );

    RETURN to_jsonb(v_lead);
END;
$$;

-------------------------------------------------------
-- 8. UPDATE ATTENTION ENGINE RPC FOR DYNAMIC STAGES
-- Preserves EXACT 26-column Phase 3 RETURNS TABLE contract
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_attention_items(
    p_workspace_id UUID,
    p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE (
    lead_id UUID,
    workspace_id UUID,
    assigned_to UUID,
    lead_name TEXT,
    phone TEXT,
    email TEXT,
    source TEXT,
    requirement TEXT,
    priority TEXT,
    stage TEXT,
    status TEXT,
    estimated_value NUMERIC,
    budget_min NUMERIC,
    budget_max NUMERIC,
    created_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    last_contacted_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,
    urgency_level TEXT,
    primary_issue TEXT,
    primary_issue_label TEXT,
    primary_issue_detail TEXT,
    issue_timestamp TIMESTAMPTZ,
    secondary_issues JSONB,
    next_action TEXT,
    sort_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_role TEXT;
    v_target_agent UUID;
    v_timezone TEXT;
    v_hot_inactivity_hours INT;
    v_new_lead_contact_threshold_hours INT;
    v_high_value_threshold NUMERIC;
    v_now TIMESTAMPTZ := NOW();
    v_workspace_end_of_day TIMESTAMPTZ;
    v_lead RECORD;

    v_rule_a_overdue BOOLEAN;
    v_rule_a_fu_id UUID;
    v_rule_a_scheduled_at TIMESTAMPTZ;
    v_rule_a_type TEXT;
    v_rule_a_notes TEXT;
    v_rule_a_hours_overdue NUMERIC;

    v_rule_b_due_today BOOLEAN;
    v_rule_b_scheduled_at TIMESTAMPTZ;
    v_rule_b_type TEXT;

    v_rule_c_new_waiting BOOLEAN;
    v_rule_c_waiting_hours NUMERIC;

    v_rule_d_hot_inactive BOOLEAN;
    v_rule_d_inactive_hours NUMERIC;

    v_rule_e_negotiation_no_action BOOLEAN;
    v_rule_f_unassigned BOOLEAN;
    v_rule_g_high_value_at_risk BOOLEAN;

    v_urgency TEXT;
    v_primary_issue TEXT;
    v_primary_label TEXT;
    v_primary_detail TEXT;
    v_issue_ts TIMESTAMPTZ;
    v_secondary JSONB;
    v_next_action_str TEXT;
    v_score NUMERIC;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    v_role := public.get_workspace_role(p_workspace_id);

    IF v_role = 'agent' THEN
        v_target_agent := v_caller_id;
    ELSE
        IF p_agent_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.workspace_members
                WHERE workspace_id = p_workspace_id AND user_id = p_agent_id AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'Target agent is not an active member of this workspace';
            END IF;
            v_target_agent := p_agent_id;
        ELSE
            v_target_agent := NULL;
        END IF;
    END IF;

    SELECT
        COALESCE(w.timezone, ws.timezone, 'UTC'),
        COALESCE(ws.hot_lead_inactivity_hours, 48),
        COALESCE(ws.new_lead_contact_threshold_hours, 4),
        ws.high_value_threshold
    INTO v_timezone, v_hot_inactivity_hours, v_new_lead_contact_threshold_hours, v_high_value_threshold
    FROM public.workspaces w
    LEFT JOIN public.workspace_settings ws ON ws.workspace_id = w.id
    WHERE w.id = p_workspace_id;

    BEGIN
        v_workspace_end_of_day := ((v_now AT TIME ZONE v_timezone)::date + INTERVAL '1 day' - INTERVAL '1 millisecond') AT TIME ZONE v_timezone;
    EXCEPTION WHEN OTHERS THEN
        v_workspace_end_of_day := v_now + INTERVAL '24 hours';
    END;

    FOR v_lead IN
        SELECT l.*
        FROM public.leads l
        WHERE l.workspace_id = p_workspace_id
          AND l.status = 'active'
          AND (v_target_agent IS NULL OR l.assigned_to = v_target_agent)
    LOOP
        v_rule_a_overdue := FALSE;
        v_rule_b_due_today := FALSE;
        v_rule_c_new_waiting := FALSE;
        v_rule_d_hot_inactive := FALSE;
        v_rule_e_negotiation_no_action := FALSE;
        v_rule_f_unassigned := FALSE;
        v_rule_g_high_value_at_risk := FALSE;
        v_secondary := '[]'::jsonb;

        -- RULE A: OVERDUE FOLLOW-UP
        SELECT f.id, f.scheduled_at, f.type, f.notes
        INTO v_rule_a_fu_id, v_rule_a_scheduled_at, v_rule_a_type, v_rule_a_notes
        FROM public.follow_ups f
        WHERE f.lead_id = v_lead.id AND f.status = 'scheduled' AND f.scheduled_at < v_now
        ORDER BY f.scheduled_at ASC
        LIMIT 1;

        IF v_rule_a_fu_id IS NOT NULL THEN
            v_rule_a_overdue := TRUE;
            v_rule_a_hours_overdue := ROUND(EXTRACT(EPOCH FROM (v_now - v_rule_a_scheduled_at)) / 3600.0, 1);
        END IF;

        -- RULE B: DUE TODAY
        IF NOT v_rule_a_overdue THEN
            SELECT f.scheduled_at, f.type
            INTO v_rule_b_scheduled_at, v_rule_b_type
            FROM public.follow_ups f
            WHERE f.lead_id = v_lead.id AND f.status = 'scheduled' AND f.scheduled_at >= v_now AND f.scheduled_at <= v_workspace_end_of_day
            ORDER BY f.scheduled_at ASC
            LIMIT 1;

            IF v_rule_b_scheduled_at IS NOT NULL THEN
                v_rule_b_due_today := TRUE;
            END IF;
        END IF;

        -- RULE C: NEW LEAD WAITING
        IF v_lead.stage = 'new' AND v_lead.last_contacted_at IS NULL THEN
            v_rule_c_waiting_hours := ROUND(EXTRACT(EPOCH FROM (v_now - v_lead.created_at)) / 3600.0, 1);
            IF v_rule_c_waiting_hours >= v_new_lead_contact_threshold_hours THEN
                v_rule_c_new_waiting := TRUE;
            END IF;
        END IF;

        -- RULE D: HOT LEAD INACTIVE
        IF v_lead.priority = 'hot' THEN
            v_rule_d_inactive_hours := ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_lead.last_activity_at, v_lead.created_at))) / 3600.0, 1);
            IF v_rule_d_inactive_hours >= v_hot_inactivity_hours THEN
                v_rule_d_hot_inactive := TRUE;
            END IF;
        END IF;

        -- RULE E: ADVANCED STAGE WITHOUT NEXT ACTION (Generalization using requires_next_action = TRUE)
        IF EXISTS (
            SELECT 1 FROM public.pipeline_stages ps
            WHERE ps.workspace_id = p_workspace_id
              AND ps.stage_key = v_lead.stage
              AND ps.requires_next_action = TRUE
        ) THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.follow_ups f
                WHERE f.lead_id = v_lead.id AND f.status = 'scheduled' AND f.scheduled_at >= v_now
            ) THEN
                v_rule_e_negotiation_no_action := TRUE;
            END IF;
        END IF;

        -- RULE F: UNASSIGNED ACTIVE LEAD
        IF v_lead.assigned_to IS NULL THEN
            v_rule_f_unassigned := TRUE;
        END IF;

        -- RULE G: HIGH-VALUE AT RISK
        IF v_high_value_threshold IS NOT NULL AND v_lead.estimated_value >= v_high_value_threshold THEN
            IF (v_rule_a_overdue OR v_rule_c_new_waiting OR v_rule_d_hot_inactive OR v_rule_e_negotiation_no_action) THEN
                v_rule_g_high_value_at_risk := TRUE;
            END IF;
        END IF;

        IF NOT (v_rule_a_overdue OR v_rule_b_due_today OR v_rule_c_new_waiting OR v_rule_d_hot_inactive OR v_rule_e_negotiation_no_action OR v_rule_f_unassigned OR v_rule_g_high_value_at_risk) THEN
            CONTINUE;
        END IF;

        -- Single Primary Issue Selection
        IF v_rule_a_overdue THEN
            v_primary_issue := 'overdue_follow_up';
            v_primary_label := 'Overdue Follow-Up';
            v_primary_detail := 'Follow-up task is ' || v_rule_a_hours_overdue || ' hours overdue';
            v_urgency := 'CRITICAL';
            v_issue_ts := v_rule_a_scheduled_at;
            v_next_action_str := 'Complete or reschedule overdue follow-up task';
        ELSIF v_rule_c_new_waiting THEN
            v_primary_issue := 'new_lead_waiting';
            v_primary_label := 'New Lead Waiting Contact';
            v_primary_detail := 'New lead has been waiting ' || v_rule_c_waiting_hours || ' hours without contact';
            v_urgency := 'CRITICAL';
            v_issue_ts := v_lead.created_at;
            v_next_action_str := 'Log first contact with lead';
        ELSIF v_rule_g_high_value_at_risk THEN
            v_primary_issue := 'high_value_at_risk';
            v_primary_label := 'High-Value Opportunity At Risk';
            v_primary_detail := 'Deal value exceeds threshold but lead is experiencing inactivity or overdue tasks';
            v_urgency := 'CRITICAL';
            v_issue_ts := COALESCE(v_lead.last_activity_at, v_lead.created_at);
            v_next_action_str := 'Review deal status and assign immediate action';
        ELSIF v_rule_d_hot_inactive THEN
            v_primary_issue := 'hot_lead_inactive';
            v_primary_label := 'Hot Lead Inactive past SLA';
            v_primary_detail := 'Hot priority lead has had no activity for ' || v_rule_d_inactive_hours || ' hours';
            v_urgency := 'HIGH';
            v_issue_ts := COALESCE(v_lead.last_activity_at, v_lead.created_at);
            v_next_action_str := 'Reach out to hot lead and record activity';
        ELSIF v_rule_e_negotiation_no_action THEN
            v_primary_issue := 'negotiation_no_action';
            v_primary_label := 'Advanced Stage Missing Next Action';
            v_primary_detail := 'Lead in proposal/negotiation stage has no upcoming follow-up scheduled';
            v_urgency := 'HIGH';
            v_issue_ts := v_lead.updated_at;
            v_next_action_str := 'Schedule next follow-up task for proposal/negotiation';
        ELSIF v_rule_f_unassigned THEN
            v_primary_issue := 'unassigned_lead';
            v_primary_label := 'Unassigned Active Lead';
            v_primary_detail := 'Lead needs to be assigned to an active team member';
            v_urgency := 'HIGH';
            v_issue_ts := v_lead.created_at;
            v_next_action_str := 'Assign lead to an agent';
        ELSIF v_rule_b_due_today THEN
            v_primary_issue := 'due_today';
            v_primary_label := 'Follow-Up Scheduled Due Today';
            v_primary_detail := 'Follow-up task scheduled for today';
            v_urgency := 'NORMAL';
            v_issue_ts := v_rule_b_scheduled_at;
            v_next_action_str := 'Execute scheduled follow-up task today';
        END IF;

        -- Populate secondary issues
        IF v_rule_a_overdue AND v_primary_issue <> 'overdue_follow_up' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'overdue_follow_up', 'label', 'Overdue Follow-Up');
        END IF;
        IF v_rule_c_new_waiting AND v_primary_issue <> 'new_lead_waiting' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'new_lead_waiting', 'label', 'New Lead Waiting Contact');
        END IF;
        IF v_rule_d_hot_inactive AND v_primary_issue <> 'hot_lead_inactive' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'hot_lead_inactive', 'label', 'Hot Lead Inactive past SLA');
        END IF;
        IF v_rule_e_negotiation_no_action AND v_primary_issue <> 'negotiation_no_action' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'negotiation_no_action', 'label', 'Advanced Stage Missing Next Action');
        END IF;
        IF v_rule_f_unassigned AND v_primary_issue <> 'unassigned_lead' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'unassigned_lead', 'label', 'Unassigned Active Lead');
        END IF;
        IF v_rule_g_high_value_at_risk AND v_primary_issue <> 'high_value_at_risk' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'high_value_at_risk', 'label', 'High-Value Opportunity At Risk');
        END IF;

        -- Calculate deterministic sort score
        v_score := 0;
        IF v_urgency = 'CRITICAL' THEN v_score := v_score + 1000; END IF;
        IF v_urgency = 'HIGH' THEN v_score := v_score + 500; END IF;
        IF v_urgency = 'NORMAL' THEN v_score := v_score + 100; END IF;
        IF v_lead.priority = 'hot' THEN v_score := v_score + 50; END IF;
        IF v_lead.priority = 'warm' THEN v_score := v_score + 20; END IF;
        v_score := v_score + LEAST(COALESCE(v_lead.estimated_value, 0) / 10000.0, 50.0);

        -- Assign return values
        lead_id := v_lead.id;
        workspace_id := v_lead.workspace_id;
        assigned_to := v_lead.assigned_to;
        lead_name := v_lead.full_name;
        phone := v_lead.phone;
        email := v_lead.email;
        source := v_lead.source;
        requirement := v_lead.requirement;
        priority := v_lead.priority;
        stage := v_lead.stage;
        status := v_lead.status;
        estimated_value := v_lead.estimated_value;
        budget_min := v_lead.budget_min;
        budget_max := v_lead.budget_max;
        created_at := v_lead.created_at;
        last_activity_at := v_lead.last_activity_at;
        last_contacted_at := v_lead.last_contacted_at;
        next_follow_up_at := COALESCE(v_rule_a_scheduled_at, v_rule_b_scheduled_at);
        urgency_level := v_urgency;
        primary_issue := v_primary_issue;
        primary_issue_label := v_primary_label;
        primary_issue_detail := v_primary_detail;
        issue_timestamp := v_issue_ts;
        secondary_issues := v_secondary;
        next_action := v_next_action_str;
        sort_score := v_score;

        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

-------------------------------------------------------
-- RLS POLICIES FOR PIPELINE STAGES
-------------------------------------------------------
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active workspace members can view pipeline stages" ON public.pipeline_stages;
CREATE POLICY "Active workspace members can view pipeline stages"
    ON public.pipeline_stages FOR SELECT
    USING (public.is_active_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Owners and managers can manage pipeline stages" ON public.pipeline_stages;
CREATE POLICY "Owners and managers can manage pipeline stages"
    ON public.pipeline_stages FOR ALL
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );
