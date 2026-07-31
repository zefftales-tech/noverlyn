-- Noverlyn Phase 2 Database Migration: Lead Operations Core RPCs and Functions
-- Timestamp: 20260731000001

-------------------------------------------------------
-- HELPER: RECALCULATE LEAD NEXT FOLLOW-UP
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_lead_next_follow_up(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_time TIMESTAMPTZ;
BEGIN
    SELECT MIN(scheduled_at) INTO v_next_time
    FROM public.follow_ups
    WHERE lead_id = p_lead_id
      AND status = 'scheduled'
      AND scheduled_at >= NOW();

    UPDATE public.leads
    SET next_follow_up_at = v_next_time
    WHERE id = p_lead_id;
END;
$$;

-------------------------------------------------------
-- 1. CREATE LEAD RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lead_rpc(
    p_workspace_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_requirement TEXT DEFAULT NULL,
    p_budget_min NUMERIC DEFAULT NULL,
    p_budget_max NUMERIC DEFAULT NULL,
    p_estimated_value NUMERIC DEFAULT NULL,
    p_priority TEXT DEFAULT 'warm',
    p_stage TEXT DEFAULT 'new',
    p_assigned_to UUID DEFAULT NULL,
    p_initial_note TEXT DEFAULT NULL,
    p_follow_up_scheduled_at TIMESTAMPTZ DEFAULT NULL,
    p_follow_up_type TEXT DEFAULT NULL,
    p_follow_up_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead_id UUID;
    v_note_id UUID;
    v_follow_up_id UUID;
    v_lead_record RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name is required';
    END IF;

    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RAISE EXCEPTION 'Phone number is required';
    END IF;

    IF p_assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = p_workspace_id AND user_id = p_assigned_to AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Target assigned agent is not an active member of this workspace';
        END IF;
    END IF;

    -- 1. Insert Lead
    INSERT INTO public.leads (
        workspace_id, full_name, phone, email, source, requirement,
        budget_min, budget_max, estimated_value, priority, stage, status,
        assigned_to, created_by, last_activity_at
    )
    VALUES (
        p_workspace_id, trim(p_full_name), trim(p_phone), NULLIF(trim(p_email), ''), NULLIF(trim(p_source), ''), NULLIF(trim(p_requirement), ''),
        p_budget_min, p_budget_max, p_estimated_value, p_priority, p_stage, 'active',
        p_assigned_to, v_caller_id, NOW()
    )
    RETURNING id INTO v_lead_id;

    -- 2. Log lead_created Activity
    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        p_workspace_id, v_lead_id, v_caller_id, 'lead_created',
        jsonb_build_object('full_name', trim(p_full_name))
    );

    -- 3. Log lead_assigned Activity if assigned
    IF p_assigned_to IS NOT NULL THEN
        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            p_workspace_id, v_lead_id, v_caller_id, 'lead_assigned',
            jsonb_build_object('previous_assignee_id', NULL, 'new_assignee_id', p_assigned_to)
        );
    END IF;

    -- 4. Initial Note
    IF p_initial_note IS NOT NULL AND trim(p_initial_note) <> '' THEN
        INSERT INTO public.lead_notes (workspace_id, lead_id, author_user_id, content)
        VALUES (p_workspace_id, v_lead_id, v_caller_id, trim(p_initial_note))
        RETURNING id INTO v_note_id;

        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            p_workspace_id, v_lead_id, v_caller_id, 'note_added',
            jsonb_build_object('note_id', v_note_id)
        );
    END IF;

    -- 5. Initial Follow-up
    IF p_follow_up_scheduled_at IS NOT NULL THEN
        INSERT INTO public.follow_ups (
            workspace_id, lead_id, assigned_to, scheduled_at, status, type, notes, created_by
        )
        VALUES (
            p_workspace_id, v_lead_id, COALESCE(p_assigned_to, v_caller_id), p_follow_up_scheduled_at,
            'scheduled', COALESCE(p_follow_up_type, 'call'), NULLIF(trim(p_follow_up_notes), ''), v_caller_id
        )
        RETURNING id INTO v_follow_up_id;

        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            p_workspace_id, v_lead_id, v_caller_id, 'follow_up_created',
            jsonb_build_object('follow_up_id', v_follow_up_id, 'type', COALESCE(p_follow_up_type, 'call'), 'scheduled_at', p_follow_up_scheduled_at)
        );

        PERFORM public.recalculate_lead_next_follow_up(v_lead_id);
    END IF;

    SELECT * INTO v_lead_record FROM public.leads WHERE id = v_lead_id;
    RETURN to_jsonb(v_lead_record);
END;
$$;

-------------------------------------------------------
-- 2. UPDATE LEAD RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_lead_rpc(
    p_lead_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_requirement TEXT DEFAULT NULL,
    p_budget_min NUMERIC DEFAULT NULL,
    p_budget_max NUMERIC DEFAULT NULL,
    p_estimated_value NUMERIC DEFAULT NULL,
    p_priority TEXT DEFAULT 'warm',
    p_assigned_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_updated_record RECORD;
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
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    IF p_assigned_to IS NOT NULL AND p_assigned_to <> COALESCE(v_lead.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = v_lead.workspace_id AND user_id = p_assigned_to AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Target assigned agent is not an active member of this workspace';
        END IF;

        -- Log lead_assigned activity
        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            v_lead.workspace_id, p_lead_id, v_caller_id, 'lead_assigned',
            jsonb_build_object('previous_assignee_id', v_lead.assigned_to, 'new_assignee_id', p_assigned_to)
        );
    END IF;

    UPDATE public.leads
    SET full_name = trim(p_full_name),
        phone = trim(p_phone),
        email = NULLIF(trim(p_email), ''),
        source = NULLIF(trim(p_source), ''),
        requirement = NULLIF(trim(p_requirement), ''),
        budget_min = p_budget_min,
        budget_max = p_budget_max,
        estimated_value = p_estimated_value,
        priority = p_priority,
        assigned_to = p_assigned_to,
        last_activity_at = NOW()
    WHERE id = p_lead_id;

    SELECT * INTO v_updated_record FROM public.leads WHERE id = p_lead_id;
    RETURN to_jsonb(v_updated_record);
END;
$$;

-------------------------------------------------------
-- 3. ADD LEAD NOTE RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_lead_note_rpc(
    p_lead_id UUID,
    p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_note_id UUID;
    v_note_record RECORD;
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

    IF p_content IS NULL OR trim(p_content) = '' THEN
        RAISE EXCEPTION 'Note content cannot be empty';
    END IF;

    INSERT INTO public.lead_notes (workspace_id, lead_id, author_user_id, content)
    VALUES (v_lead.workspace_id, p_lead_id, v_caller_id, trim(p_content))
    RETURNING id INTO v_note_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_lead.workspace_id, p_lead_id, v_caller_id, 'note_added',
        jsonb_build_object('note_id', v_note_id)
    );

    UPDATE public.leads SET last_activity_at = NOW() WHERE id = p_lead_id;

    SELECT * INTO v_note_record FROM public.lead_notes WHERE id = v_note_id;
    RETURN to_jsonb(v_note_record);
END;
$$;

-------------------------------------------------------
-- 4. LOG CONTACT RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_contact_rpc(
    p_lead_id UUID,
    p_contact_method TEXT,
    p_outcome TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_follow_up_scheduled_at TIMESTAMPTZ DEFAULT NULL,
    p_follow_up_type TEXT DEFAULT NULL,
    p_follow_up_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_follow_up_id UUID;
    v_updated_lead RECORD;
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

    -- Update lead contact timestamps
    UPDATE public.leads
    SET last_contacted_at = NOW(),
        last_activity_at = NOW(),
        stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END
    WHERE id = p_lead_id;

    -- Log contact_logged activity
    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_lead.workspace_id, p_lead_id, v_caller_id, 'contact_logged',
        jsonb_build_object('contact_method', p_contact_method, 'outcome', NULLIF(trim(p_outcome), ''), 'notes', NULLIF(trim(p_notes), ''))
    );

    -- Optional follow-up scheduling
    IF p_follow_up_scheduled_at IS NOT NULL THEN
        INSERT INTO public.follow_ups (
            workspace_id, lead_id, assigned_to, scheduled_at, status, type, notes, created_by
        )
        VALUES (
            v_lead.workspace_id, p_lead_id, COALESCE(v_lead.assigned_to, v_caller_id), p_follow_up_scheduled_at,
            'scheduled', COALESCE(p_follow_up_type, 'call'), NULLIF(trim(p_follow_up_notes), ''), v_caller_id
        )
        RETURNING id INTO v_follow_up_id;

        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            v_lead.workspace_id, p_lead_id, v_caller_id, 'follow_up_created',
            jsonb_build_object('follow_up_id', v_follow_up_id, 'type', COALESCE(p_follow_up_type, 'call'), 'scheduled_at', p_follow_up_scheduled_at)
        );

        PERFORM public.recalculate_lead_next_follow_up(p_lead_id);
    END IF;

    SELECT * INTO v_updated_lead FROM public.leads WHERE id = p_lead_id;
    RETURN to_jsonb(v_updated_lead);
END;
$$;

-------------------------------------------------------
-- 5. SCHEDULE FOLLOW-UP RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_follow_up_rpc(
    p_lead_id UUID,
    p_scheduled_at TIMESTAMPTZ,
    p_type TEXT DEFAULT 'call',
    p_assigned_to UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_follow_up_id UUID;
    v_target_assignee UUID;
    v_fu_record RECORD;
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

    v_target_assignee := COALESCE(p_assigned_to, v_lead.assigned_to, v_caller_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = v_lead.workspace_id AND user_id = v_target_assignee AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Target assigned user is not an active member of this workspace';
    END IF;

    INSERT INTO public.follow_ups (
        workspace_id, lead_id, assigned_to, scheduled_at, status, type, notes, created_by
    )
    VALUES (
        v_lead.workspace_id, p_lead_id, v_target_assignee, p_scheduled_at,
        'scheduled', p_type, NULLIF(trim(p_notes), ''), v_caller_id
    )
    RETURNING id INTO v_follow_up_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_lead.workspace_id, p_lead_id, v_caller_id, 'follow_up_created',
        jsonb_build_object('follow_up_id', v_follow_up_id, 'type', p_type, 'scheduled_at', p_scheduled_at)
    );

    UPDATE public.leads SET last_activity_at = NOW() WHERE id = p_lead_id;
    PERFORM public.recalculate_lead_next_follow_up(p_lead_id);

    SELECT * INTO v_fu_record FROM public.follow_ups WHERE id = v_follow_up_id;
    RETURN to_jsonb(v_fu_record);
END;
$$;

-------------------------------------------------------
-- 6. COMPLETE FOLLOW-UP RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_follow_up_rpc(
    p_follow_up_id UUID,
    p_outcome TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_fu RECORD;
    v_updated_fu RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_fu FROM public.follow_ups WHERE id = p_follow_up_id;
    IF v_fu.id IS NULL THEN
        RAISE EXCEPTION 'Follow-up not found';
    END IF;

    IF NOT public.is_active_workspace_member(v_fu.workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.follow_ups
    SET status = 'completed',
        completed_at = NOW(),
        outcome = NULLIF(trim(p_outcome), ''),
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes)
    WHERE id = p_follow_up_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_fu.workspace_id, v_fu.lead_id, v_caller_id, 'follow_up_completed',
        jsonb_build_object('follow_up_id', p_follow_up_id, 'outcome', NULLIF(trim(p_outcome), ''))
    );

    UPDATE public.leads SET last_activity_at = NOW() WHERE id = v_fu.lead_id;
    PERFORM public.recalculate_lead_next_follow_up(v_fu.lead_id);

    SELECT * INTO v_updated_fu FROM public.follow_ups WHERE id = p_follow_up_id;
    RETURN to_jsonb(v_updated_fu);
END;
$$;

-------------------------------------------------------
-- 7. RESCHEDULE FOLLOW-UP RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_follow_up_rpc(
    p_follow_up_id UUID,
    p_scheduled_at TIMESTAMPTZ,
    p_type TEXT DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_fu RECORD;
    v_updated_fu RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_fu FROM public.follow_ups WHERE id = p_follow_up_id;
    IF v_fu.id IS NULL THEN
        RAISE EXCEPTION 'Follow-up not found';
    END IF;

    IF NOT public.is_active_workspace_member(v_fu.workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF p_assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = v_fu.workspace_id AND user_id = p_assigned_to AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Target assigned user is not an active member of this workspace';
        END IF;
    END IF;

    UPDATE public.follow_ups
    SET scheduled_at = p_scheduled_at,
        type = COALESCE(p_type, type),
        assigned_to = COALESCE(p_assigned_to, assigned_to),
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
        status = 'scheduled'
    WHERE id = p_follow_up_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_fu.workspace_id, v_fu.lead_id, v_caller_id, 'follow_up_rescheduled',
        jsonb_build_object('follow_up_id', p_follow_up_id, 'new_scheduled_at', p_scheduled_at)
    );

    UPDATE public.leads SET last_activity_at = NOW() WHERE id = v_fu.lead_id;
    PERFORM public.recalculate_lead_next_follow_up(v_fu.lead_id);

    SELECT * INTO v_updated_fu FROM public.follow_ups WHERE id = p_follow_up_id;
    RETURN to_jsonb(v_updated_fu);
END;
$$;

-------------------------------------------------------
-- 8. CANCEL FOLLOW-UP RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_follow_up_rpc(
    p_follow_up_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_fu RECORD;
    v_updated_fu RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_fu FROM public.follow_ups WHERE id = p_follow_up_id;
    IF v_fu.id IS NULL THEN
        RAISE EXCEPTION 'Follow-up not found';
    END IF;

    IF NOT public.is_active_workspace_member(v_fu.workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.follow_ups
    SET status = 'cancelled',
        notes = COALESCE(NULLIF(trim(p_reason), ''), notes)
    WHERE id = p_follow_up_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_fu.workspace_id, v_fu.lead_id, v_caller_id, 'follow_up_cancelled',
        jsonb_build_object('follow_up_id', p_follow_up_id, 'reason', NULLIF(trim(p_reason), ''))
    );

    UPDATE public.leads SET last_activity_at = NOW() WHERE id = v_fu.lead_id;
    PERFORM public.recalculate_lead_next_follow_up(v_fu.lead_id);

    SELECT * INTO v_updated_fu FROM public.follow_ups WHERE id = p_follow_up_id;
    RETURN to_jsonb(v_updated_fu);
END;
$$;

-------------------------------------------------------
-- 9. CHANGE LEAD STAGE RPC
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
    v_lead RECORD;
    v_updated_lead RECORD;
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

    IF p_new_stage = 'lost' THEN
        RAISE EXCEPTION 'Lost stage requires mark_lead_lost_rpc with a mandatory lost reason';
    END IF;

    IF p_new_stage = 'won' THEN
        UPDATE public.leads
        SET stage = 'won', status = 'won', last_activity_at = NOW()
        WHERE id = p_lead_id;

        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            v_lead.workspace_id, p_lead_id, v_caller_id, 'deal_won',
            jsonb_build_object('from_stage', v_lead.stage)
        );
    ELSE
        UPDATE public.leads
        SET stage = p_new_stage, status = 'active', last_activity_at = NOW()
        WHERE id = p_lead_id;

        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            v_lead.workspace_id, p_lead_id, v_caller_id, 'stage_changed',
            jsonb_build_object('from_stage', v_lead.stage, 'to_stage', p_new_stage)
        );
    END IF;

    SELECT * INTO v_updated_lead FROM public.leads WHERE id = p_lead_id;
    RETURN to_jsonb(v_updated_lead);
END;
$$;

-------------------------------------------------------
-- 10. MARK LEAD LOST RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_lead_lost_rpc(
    p_lead_id UUID,
    p_lost_reason TEXT,
    p_lost_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_updated_lead RECORD;
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

    IF p_lost_reason IS NULL OR p_lost_reason NOT IN ('price', 'no_response', 'bought_elsewhere', 'location', 'financing', 'not_ready', 'other') THEN
        RAISE EXCEPTION 'A valid lost reason is required';
    END IF;

    UPDATE public.leads
    SET stage = 'lost',
        status = 'lost',
        lost_reason = p_lost_reason,
        lost_notes = NULLIF(trim(p_lost_notes), ''),
        lost_at = NOW(),
        last_activity_at = NOW()
    WHERE id = p_lead_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_lead.workspace_id, p_lead_id, v_caller_id, 'deal_lost',
        jsonb_build_object('lost_reason', p_lost_reason, 'lost_notes', NULLIF(trim(p_lost_notes), ''))
    );

    SELECT * INTO v_updated_lead FROM public.leads WHERE id = p_lead_id;
    RETURN to_jsonb(v_updated_lead);
END;
$$;

-------------------------------------------------------
-- 11. ASSIGN LEAD RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_lead_rpc(
    p_lead_id UUID,
    p_assigned_to UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_updated_lead RECORD;
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

    IF p_assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = v_lead.workspace_id AND user_id = p_assigned_to AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Target assigned user is not an active member of this workspace';
        END IF;
    END IF;

    UPDATE public.leads
    SET assigned_to = p_assigned_to,
        last_activity_at = NOW()
    WHERE id = p_lead_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_lead.workspace_id, p_lead_id, v_caller_id, 'lead_assigned',
        jsonb_build_object('previous_assignee_id', v_lead.assigned_to, 'new_assignee_id', p_assigned_to)
    );

    SELECT * INTO v_updated_lead FROM public.leads WHERE id = p_lead_id;
    RETURN to_jsonb(v_updated_lead);
END;
$$;

-------------------------------------------------------
-- 12. UPDATE WORKSPACE SETTINGS RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_workspace_settings_rpc(
    p_workspace_id UUID,
    p_name TEXT,
    p_timezone TEXT,
    p_currency TEXT,
    p_hot_lead_inactivity_hours INTEGER DEFAULT 48,
    p_new_lead_contact_threshold_hours INTEGER DEFAULT 4,
    p_high_value_threshold NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_role TEXT;
    v_settings RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_role := public.get_workspace_role(p_workspace_id);
    IF v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only workspace owners and managers can update workspace settings';
    END IF;

    -- Update workspace identity
    UPDATE public.workspaces
    SET name = trim(p_name),
        timezone = p_timezone,
        currency = p_currency
    WHERE id = p_workspace_id;

    -- Update workspace settings
    UPDATE public.workspace_settings
    SET timezone = p_timezone,
        currency = p_currency,
        hot_lead_inactivity_hours = p_hot_lead_inactivity_hours,
        new_lead_contact_threshold_hours = p_new_lead_contact_threshold_hours,
        high_value_threshold = p_high_value_threshold
    WHERE workspace_id = p_workspace_id;

    SELECT * INTO v_settings FROM public.workspace_settings WHERE workspace_id = p_workspace_id;
    RETURN to_jsonb(v_settings);
END;
$$;

-------------------------------------------------------
-- REVOKE PUBLIC EXECUTE & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_lead_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lead_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_lead_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lead_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_lead_note_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_lead_note_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.log_contact_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_contact_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.schedule_follow_up_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_follow_up_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_follow_up_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_follow_up_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reschedule_follow_up_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_follow_up_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_follow_up_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_follow_up_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.change_lead_stage_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_lead_stage_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_lead_lost_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_lead_lost_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.assign_lead_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_lead_rpc TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_workspace_settings_rpc FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_workspace_settings_rpc TO authenticated;
