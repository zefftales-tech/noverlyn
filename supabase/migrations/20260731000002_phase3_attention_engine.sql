-- Noverlyn Phase 3 Migration: Attention Engine & Work Queue Operational RPC
-- Timestamp: 20260731000002

-------------------------------------------------------
-- 1. OPERATIONAL INDEXES (Safe IF NOT EXISTS)
-------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_workspace_status_stage
    ON public.leads(workspace_id, status, stage);

CREATE INDEX IF NOT EXISTS idx_leads_workspace_assigned
    ON public.leads(workspace_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_leads_workspace_priority
    ON public.leads(workspace_id, priority);

CREATE INDEX IF NOT EXISTS idx_follow_ups_workspace_status_scheduled
    ON public.follow_ups(workspace_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_follow_ups_lead_status
    ON public.follow_ups(lead_id, status);

-------------------------------------------------------
-- 2. CANONICAL ATTENTION ENGINE RPC
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

    -- Rule flags & details for single lead
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

    -- Role-aware Agent filtering
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

    -- Workspace settings & timezone boundaries
    SELECT
        COALESCE(w.timezone, ws.timezone, 'UTC'),
        COALESCE(ws.hot_lead_inactivity_hours, 48),
        COALESCE(ws.new_lead_contact_threshold_hours, 4),
        ws.high_value_threshold
    INTO v_timezone, v_hot_inactivity_hours, v_new_lead_contact_threshold_hours, v_high_value_threshold
    FROM public.workspaces w
    LEFT JOIN public.workspace_settings ws ON ws.workspace_id = w.id
    WHERE w.id = p_workspace_id;

    -- Calculate end of day in workspace timezone
    BEGIN
        v_workspace_end_of_day := ((v_now AT TIME ZONE v_timezone)::date + INTERVAL '1 day' - INTERVAL '1 millisecond') AT TIME ZONE v_timezone;
    EXCEPTION WHEN OTHERS THEN
        v_workspace_end_of_day := v_now + INTERVAL '24 hours';
    END;

    -- Iterate active leads in workspace
    FOR v_lead IN
        SELECT l.*
        FROM public.leads l
        WHERE l.workspace_id = p_workspace_id
          AND l.status = 'active'
          AND (v_target_agent IS NULL OR l.assigned_to = v_target_agent)
    LOOP
        -- Reset rule variables
        v_rule_a_overdue := FALSE;
        v_rule_b_due_today := FALSE;
        v_rule_c_new_waiting := FALSE;
        v_rule_d_hot_inactive := FALSE;
        v_rule_e_negotiation_no_action := FALSE;
        v_rule_f_unassigned := FALSE;
        v_rule_g_high_value_at_risk := FALSE;
        v_secondary := '[]'::jsonb;

        -------------------------------------------------------
        -- RULE A: OVERDUE FOLLOW-UP
        -------------------------------------------------------
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

        -------------------------------------------------------
        -- RULE B: DUE TODAY (Excludes Overdue)
        -------------------------------------------------------
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

        -------------------------------------------------------
        -- RULE C: NEW LEAD WAITING
        -------------------------------------------------------
        IF v_lead.stage = 'new' AND v_lead.last_contacted_at IS NULL THEN
            v_rule_c_waiting_hours := ROUND(EXTRACT(EPOCH FROM (v_now - v_lead.created_at)) / 3600.0, 1);
            IF v_rule_c_waiting_hours >= v_new_lead_contact_threshold_hours THEN
                v_rule_c_new_waiting := TRUE;
            END IF;
        END IF;

        -------------------------------------------------------
        -- RULE D: HOT LEAD INACTIVE
        -------------------------------------------------------
        IF v_lead.priority = 'hot' THEN
            v_rule_d_inactive_hours := ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_lead.last_activity_at, v_lead.created_at))) / 3600.0, 1);
            IF v_rule_d_inactive_hours >= v_hot_inactivity_hours THEN
                v_rule_d_hot_inactive := TRUE;
            END IF;
        END IF;

        -------------------------------------------------------
        -- RULE E: NEGOTIATION WITHOUT NEXT ACTION
        -------------------------------------------------------
        IF v_lead.stage = 'negotiation' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.follow_ups f
                WHERE f.lead_id = v_lead.id AND f.status = 'scheduled' AND f.scheduled_at >= v_now
            ) THEN
                v_rule_e_negotiation_no_action := TRUE;
            END IF;
        END IF;

        -------------------------------------------------------
        -- RULE F: UNASSIGNED ACTIVE LEAD
        -------------------------------------------------------
        IF v_lead.assigned_to IS NULL THEN
            v_rule_f_unassigned := TRUE;
        END IF;

        -------------------------------------------------------
        -- RULE G: HIGH-VALUE AT RISK
        -------------------------------------------------------
        IF v_high_value_threshold IS NOT NULL AND v_lead.estimated_value >= v_high_value_threshold THEN
            IF (v_rule_a_overdue OR v_rule_c_new_waiting OR v_rule_d_hot_inactive OR v_rule_e_negotiation_no_action) THEN
                v_rule_g_high_value_at_risk := TRUE;
            END IF;
        END IF;

        -- Filter: Only surface leads that satisfy AT LEAST ONE attention rule or have upcoming follow-up
        IF NOT (v_rule_a_overdue OR v_rule_b_due_today OR v_rule_c_new_waiting OR v_rule_d_hot_inactive OR v_rule_e_negotiation_no_action OR v_rule_f_unassigned OR v_rule_g_high_value_at_risk) THEN
            CONTINUE;
        END IF;

        -------------------------------------------------------
        -- URGENCY & PRIMARY ISSUE CLASSIFICATION
        -------------------------------------------------------
        IF (v_rule_a_overdue AND v_rule_a_hours_overdue >= 24) OR v_rule_d_hot_inactive OR (v_rule_g_high_value_at_risk AND v_rule_a_overdue) THEN
            v_urgency := 'CRITICAL';
        ELSIF v_rule_a_overdue OR v_rule_c_new_waiting OR v_rule_e_negotiation_no_action OR v_rule_g_high_value_at_risk THEN
            v_urgency := 'HIGH';
        ELSE
            v_urgency := 'NORMAL';
        END IF;

        -- Select Primary Issue & Label
        IF v_rule_a_overdue THEN
            v_primary_issue := 'overdue_follow_up';
            v_primary_label := 'Follow-up Overdue';
            v_primary_detail := 'Follow-up ' || UPPER(v_rule_a_type) || ' overdue by ' || v_rule_a_hours_overdue || 'h';
            v_issue_ts := v_rule_a_scheduled_at;
            v_next_action_str := 'Complete or reschedule overdue follow-up action';
        ELSIF v_rule_c_new_waiting THEN
            v_primary_issue := 'new_lead_waiting';
            v_primary_label := 'New Lead Uncontacted';
            v_primary_detail := 'New inbound lead waiting ' || v_rule_c_waiting_hours || 'h without contact';
            v_issue_ts := v_lead.created_at;
            v_next_action_str := 'Log initial client contact';
        ELSIF v_rule_d_hot_inactive THEN
            v_primary_issue := 'hot_lead_inactive';
            v_primary_label := 'Hot Lead Stalled';
            v_primary_detail := 'Hot priority deal inactive for ' || v_rule_d_inactive_hours || 'h';
            v_issue_ts := COALESCE(v_lead.last_activity_at, v_lead.created_at);
            v_next_action_str := 'Contact client and log progress activity';
        ELSIF v_rule_e_negotiation_no_action THEN
            v_primary_issue := 'negotiation_no_action';
            v_primary_label := 'Negotiation Stalled';
            v_primary_detail := 'Negotiation stage lead has no scheduled follow-up';
            v_issue_ts := COALESCE(v_lead.last_activity_at, v_lead.created_at);
            v_next_action_str := 'Schedule next viewing or offer follow-up';
        ELSIF v_rule_g_high_value_at_risk THEN
            v_primary_issue := 'high_value_at_risk';
            v_primary_label := 'High-Value Risk';
            v_primary_detail := 'High-value opportunity (' || COALESCE(v_lead.estimated_value, 0) || ') has active operational risk';
            v_issue_ts := COALESCE(v_lead.last_activity_at, v_lead.created_at);
            v_next_action_str := 'Resolve active risk item immediately';
        ELSIF v_rule_b_due_today THEN
            v_primary_issue := 'due_today';
            v_primary_label := 'Follow-up Due Today';
            v_primary_detail := 'Follow-up ' || UPPER(v_rule_b_type) || ' scheduled for today';
            v_issue_ts := v_rule_b_scheduled_at;
            v_next_action_str := 'Complete scheduled follow-up task today';
        ELSE
            v_primary_issue := 'unassigned_lead';
            v_primary_label := 'Unassigned Active Lead';
            v_primary_detail := 'No workspace agent assigned to this active lead';
            v_issue_ts := v_lead.created_at;
            v_next_action_str := 'Assign responsible sales agent';
        END IF;

        -- Build Secondary Issues JSONB array for duplicate aggregation
        IF v_rule_a_overdue AND v_primary_issue <> 'overdue_follow_up' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'overdue_follow_up', 'label', 'Overdue Follow-up (' || v_rule_a_hours_overdue || 'h)');
        END IF;
        IF v_rule_c_new_waiting AND v_primary_issue <> 'new_lead_waiting' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'new_lead_waiting', 'label', 'Uncontacted (' || v_rule_c_waiting_hours || 'h)');
        END IF;
        IF v_rule_d_hot_inactive AND v_primary_issue <> 'hot_lead_inactive' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'hot_lead_inactive', 'label', 'HOT Inactive (' || v_rule_d_inactive_hours || 'h)');
        END IF;
        IF v_rule_e_negotiation_no_action AND v_primary_issue <> 'negotiation_no_action' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'negotiation_no_action', 'label', 'No Next Action');
        END IF;
        IF v_rule_f_unassigned AND v_primary_issue <> 'unassigned_lead' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'unassigned_lead', 'label', 'Unassigned');
        END IF;
        IF v_rule_g_high_value_at_risk AND v_primary_issue <> 'high_value_at_risk' THEN
            v_secondary := v_secondary || jsonb_build_object('type', 'high_value_at_risk', 'label', 'High-Value Opportunity');
        END IF;

        -- Calculate Deterministic Sort Score
        IF v_urgency = 'CRITICAL' THEN
            v_score := 300000 + COALESCE(v_rule_a_hours_overdue, v_rule_d_inactive_hours, 0);
        ELSIF v_urgency = 'HIGH' THEN
            v_score := 200000 + COALESCE(v_rule_a_hours_overdue, v_rule_c_waiting_hours, 0);
        ELSE
            v_score := 100000 + (EXTRACT(EPOCH FROM v_now) / 100000.0);
        END IF;

        -- Assign return record
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
        next_follow_up_at := v_lead.next_follow_up_at;
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
END;
$$;

-------------------------------------------------------
-- REVOKE PUBLIC EXECUTE & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_workspace_attention_items(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_attention_items(UUID, UUID) TO authenticated;
