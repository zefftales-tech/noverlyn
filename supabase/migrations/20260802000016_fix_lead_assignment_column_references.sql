-- Noverlyn Corrective Migration 00016: Fix Lead Assignment Column References (assigned_user_id -> assigned_to)
-- Timestamp: 20260802000016

-------------------------------------------------------
-- 1. REPAIR SOFT_DELETE_LEAD_RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_lead_rpc(
    p_lead_id UUID,
    p_deletion_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
    IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_lead.workspace_id) AND public.get_workspace_role(v_lead.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Owners and Managers can move leads to Trash';
    END IF;

    UPDATE public.leads
    SET deleted_at = NOW(),
        deleted_by = v_caller_id,
        deletion_reason = trim(p_deletion_reason),
        previous_stage_key = v_lead.stage,
        previous_assigned_to = v_lead.assigned_to,
        updated_at = NOW()
    WHERE id = p_lead_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (v_lead.workspace_id, p_lead_id, v_caller_id, 'lead_deleted', jsonb_build_object('reason', p_deletion_reason));

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-------------------------------------------------------
-- 2. REPAIR RESTORE_DELETED_LEAD_RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_deleted_lead_rpc(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_restored_stage TEXT;
    v_restored_assignee UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
    IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_lead.workspace_id) AND public.get_workspace_role(v_lead.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Owners and Managers can restore deleted leads';
    END IF;

    IF v_lead.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Lead is not in Trash';
    END IF;

    -- Validate previous stage existence
    IF v_lead.previous_stage_key IS NOT NULL AND EXISTS (SELECT 1 FROM public.pipeline_stages WHERE workspace_id = v_lead.workspace_id AND stage_key = v_lead.previous_stage_key) THEN
        v_restored_stage := v_lead.previous_stage_key;
    ELSE
        SELECT stage_key INTO v_restored_stage FROM public.pipeline_stages WHERE workspace_id = v_lead.workspace_id ORDER BY position ASC LIMIT 1;
        IF v_restored_stage IS NULL THEN v_restored_stage := 'new'; END IF;
    END IF;

    -- Validate previous assignee active membership
    IF v_lead.previous_assigned_to IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = v_lead.workspace_id AND user_id = v_lead.previous_assigned_to AND status = 'active') THEN
        v_restored_assignee := v_lead.previous_assigned_to;
    ELSE
        v_restored_assignee := NULL;
    END IF;

    UPDATE public.leads
    SET deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL,
        stage = v_restored_stage,
        assigned_to = v_restored_assignee,
        archived_at = NULL,
        updated_at = NOW()
    WHERE id = p_lead_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (v_lead.workspace_id, p_lead_id, v_caller_id, 'lead_restored_from_trash', jsonb_build_object('restored_stage', v_restored_stage));

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-------------------------------------------------------
-- 3. REPAIR APPROVE_PUBLIC_FORM_SUBMISSION_RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_public_form_submission_rpc(
    p_submission_id UUID,
    p_assigned_to UUID DEFAULT NULL,
    p_priority TEXT DEFAULT 'warm',
    p_stage_key TEXT DEFAULT NULL,
    p_next_follow_up_at TIMESTAMPTZ DEFAULT NULL,
    p_internal_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_sub RECORD;
    v_first_stage TEXT;
    v_lead_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Lock submission row for atomic review
    SELECT * INTO v_sub
    FROM public.public_form_submissions
    WHERE id = p_submission_id
    FOR UPDATE;

    IF v_sub.id IS NULL THEN RAISE EXCEPTION 'Submission record not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_sub.workspace_id) AND public.get_workspace_role(v_sub.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Owners and Managers can approve form submissions';
    END IF;

    IF v_sub.status <> 'pending' THEN
        RAISE EXCEPTION 'This submission has already been processed (Current status: %)', v_sub.status;
    END IF;

    -- Validate assigned agent if specified
    IF p_assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = v_sub.workspace_id AND user_id = p_assigned_to AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Assigned agent is not an active member of this workspace';
        END IF;
    END IF;

    -- Determine pipeline stage
    IF p_stage_key IS NOT NULL AND p_stage_key <> '' THEN
        IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE workspace_id = v_sub.workspace_id AND stage_key = p_stage_key) THEN
            RAISE EXCEPTION 'Invalid pipeline stage selected';
        END IF;
        v_first_stage := p_stage_key;
    ELSE
        SELECT stage_key INTO v_first_stage
        FROM public.pipeline_stages
        WHERE workspace_id = v_sub.workspace_id
        ORDER BY position ASC LIMIT 1;

        IF v_first_stage IS NULL THEN v_first_stage := 'new'; END IF;
    END IF;

    -- 1. Create Lead Record with assigned_to column
    INSERT INTO public.leads (
        workspace_id, full_name, phone, email, source, requirement, estimated_value, priority,
        stage, status, assigned_to, public_form_data, created_at, updated_at
    )
    VALUES (
        v_sub.workspace_id, v_sub.full_name, v_sub.phone, v_sub.email, COALESCE(v_sub.source, 'Public Form'),
        v_sub.requirement, v_sub.budget, COALESCE(p_priority, 'warm'), v_first_stage, 'active',
        p_assigned_to,
        jsonb_build_object(
            'source_detail', v_sub.source_detail,
            'submitted_at', v_sub.submitted_at,
            'approved_at', NOW(),
            'approved_by', v_caller_id,
            'answers', v_sub.custom_answers
        ),
        NOW(), NOW()
    )
    RETURNING id INTO v_lead_id;

    -- 2. Add Activity Log
    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_sub.workspace_id, v_lead_id, v_caller_id, 'lead_created',
        jsonb_build_object('source', 'Public Form Review', 'submission_id', v_sub.id)
    );

    -- 3. Optional Follow-up & Note with assigned_to column
    IF p_next_follow_up_at IS NOT NULL THEN
        INSERT INTO public.follow_ups (workspace_id, lead_id, assigned_to, follow_up_type, due_date, scheduled_at, status, created_at, updated_at)
        VALUES (v_sub.workspace_id, v_lead_id, COALESCE(p_assigned_to, v_caller_id), 'call', p_next_follow_up_at, p_next_follow_up_at, 'pending', NOW(), NOW());
    END IF;

    IF p_internal_note IS NOT NULL AND trim(p_internal_note) <> '' THEN
        INSERT INTO public.lead_notes (workspace_id, lead_id, author_id, content, created_at)
        VALUES (v_sub.workspace_id, v_lead_id, v_caller_id, trim(p_internal_note), NOW());
    END IF;

    -- 4. Update Submission Status
    UPDATE public.public_form_submissions
    SET status = 'approved',
        approved_lead_id = v_lead_id,
        reviewed_by = v_caller_id,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_submission_id;

    -- 5. Notify Assigned Agent if specified
    IF p_assigned_to IS NOT NULL AND p_assigned_to <> v_caller_id THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_workspace_role_notifications') THEN
                PERFORM public.create_workspace_role_notifications(
                    v_sub.workspace_id,
                    ARRAY['owner', 'manager']::text[],
                    'lead_assigned',
                    'New Lead Assigned',
                    v_sub.full_name || ' was assigned to you from Form Submission Review.',
                    'lead',
                    v_lead_id,
                    'assign_sub:' || v_sub.id::text,
                    jsonb_build_object('lead_id', v_lead_id, 'submission_id', v_sub.id)
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Assignment notification dispatch skipped: %', SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id, 'submission_id', p_submission_id);
END;
$$;

-------------------------------------------------------
-- 4. REPAIR CHANGE_LEAD_STAGE_RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_lead_stage_rpc(
    p_lead_id UUID,
    p_new_stage TEXT,
    p_lost_reason TEXT DEFAULT NULL,
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
    v_old_stage TEXT;
    v_stage_info RECORD;
    v_actor_name TEXT;
    v_lead_name TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

    IF NOT public.is_active_workspace_member(v_lead.workspace_id) THEN
        RAISE EXCEPTION 'Access denied to this workspace';
    END IF;

    SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_caller_id;

    v_old_stage := v_lead.stage;
    v_lead_name := COALESCE(v_lead.full_name, 'Lead');

    SELECT * INTO v_stage_info
    FROM public.pipeline_stages
    WHERE workspace_id = v_lead.workspace_id AND stage_key = p_new_stage;

    -- Update Lead Record
    UPDATE public.leads
    SET stage = p_new_stage,
        lost_reason = CASE WHEN COALESCE(v_stage_info.is_lost, false) THEN p_lost_reason ELSE NULL END,
        lost_notes = CASE WHEN COALESCE(v_stage_info.is_lost, false) THEN p_lost_notes ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_lead_id;

    -- Log Stage Activity
    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (
        v_lead.workspace_id, p_lead_id, v_caller_id, 'stage_change',
        jsonb_build_object('from_stage', v_old_stage, 'to_stage', p_new_stage, 'lost_reason', p_lost_reason)
    );

    -- Trigger Notifications for Won / Lost
    IF COALESCE(v_stage_info.is_won, false) OR p_new_stage = 'won' THEN
        PERFORM public.create_workspace_role_notifications(
            v_lead.workspace_id,
            ARRAY['owner', 'manager']::text[],
            'lead_won',
            'Deal Marked Won! 🎉',
            v_lead_name || ' was closed as Won by ' || COALESCE(v_actor_name, 'Team Member'),
            'lead',
            p_lead_id,
            'lead_won:' || p_lead_id::text || ':' || CURRENT_DATE::text,
            jsonb_build_object('lead_id', p_lead_id, 'value', v_lead.estimated_value),
            v_caller_id
        );
        IF v_lead.assigned_to IS NOT NULL AND v_lead.assigned_to <> v_caller_id THEN
            PERFORM public.create_notification_for_user(
                v_lead.workspace_id, v_lead.assigned_to, 'lead_won', 'Your Deal Was Won! 🎉',
                v_lead_name || ' was closed as Won.', 'lead', p_lead_id,
                'lead_won_assignee:' || p_lead_id::text || ':' || CURRENT_DATE::text,
                jsonb_build_object('lead_id', p_lead_id)
            );
        END IF;
    ELSIF COALESCE(v_stage_info.is_lost, false) OR p_new_stage = 'lost' THEN
        PERFORM public.create_workspace_role_notifications(
            v_lead.workspace_id,
            ARRAY['owner', 'manager']::text[],
            'lead_lost',
            'Opportunity Marked Lost',
            v_lead_name || ' was marked Lost (' || COALESCE(p_lost_reason, 'No reason specified') || ')',
            'lead',
            p_lead_id,
            'lead_lost:' || p_lead_id::text || ':' || CURRENT_DATE::text,
            jsonb_build_object('lead_id', p_lead_id, 'lost_reason', p_lost_reason),
            v_caller_id
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'stage', p_new_stage);
END;
$$;

-------------------------------------------------------
-- 5. REPAIR GENERATE_DUE_AND_OVERDUE_NOTIFICATIONS
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_due_and_overdue_notifications(
    p_workspace_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fu RECORD;
    v_count INTEGER := 0;
    v_today_date TEXT := CURRENT_DATE::text;
BEGIN
    -- 1. Due Today Follow-ups
    FOR v_fu IN
        SELECT f.id, f.workspace_id, f.lead_id, f.assigned_to, f.follow_up_type, f.due_date, l.full_name as lead_name
        FROM public.follow_ups f
        JOIN public.leads l ON l.id = f.lead_id
        WHERE f.workspace_id = p_workspace_id
          AND f.status = 'pending'
          AND f.due_date::date = CURRENT_DATE
          AND l.deleted_at IS NULL
          AND l.archived_at IS NULL
    LOOP
        IF v_fu.assigned_to IS NOT NULL THEN
            IF public.create_notification_for_user(
                v_fu.workspace_id,
                v_fu.assigned_to,
                'followup_due',
                'Follow-Up Due Today',
                COALESCE(v_fu.follow_up_type, 'Follow-up') || ' scheduled today for ' || COALESCE(v_fu.lead_name, 'Lead'),
                'lead',
                v_fu.lead_id,
                'followup_due:' || v_fu.id::text || ':' || v_today_date,
                jsonb_build_object('follow_up_id', v_fu.id, 'lead_id', v_fu.lead_id)
            ) IS NOT NULL THEN
                v_count := v_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- 2. Overdue Follow-ups
    FOR v_fu IN
        SELECT f.id, f.workspace_id, f.lead_id, f.assigned_to, f.follow_up_type, f.due_date, l.full_name as lead_name
        FROM public.follow_ups f
        JOIN public.leads l ON l.id = f.lead_id
        WHERE f.workspace_id = p_workspace_id
          AND f.status = 'pending'
          AND f.due_date::date < CURRENT_DATE
          AND l.deleted_at IS NULL
          AND l.archived_at IS NULL
    LOOP
        IF v_fu.assigned_to IS NOT NULL THEN
            IF public.create_notification_for_user(
                v_fu.workspace_id,
                v_fu.assigned_to,
                'followup_overdue',
                'Follow-Up Overdue!',
                COALESCE(v_fu.follow_up_type, 'Follow-up') || ' for ' || COALESCE(v_fu.lead_name, 'Lead') || ' is past due',
                'lead',
                v_fu.lead_id,
                'followup_overdue:' || v_fu.id::text || ':' || v_today_date,
                jsonb_build_object('follow_up_id', v_fu.id, 'lead_id', v_fu.lead_id)
            ) IS NOT NULL THEN
                v_count := v_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

-------------------------------------------------------
-- 6. REPAIR GENERATE_DAILY_DIGEST_FOR_WORKSPACE
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_daily_digest_for_workspace(
    p_workspace_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_member RECORD;
    v_due_count INTEGER;
    v_overdue_count INTEGER;
    v_unassigned_count INTEGER;
    v_today_date TEXT := CURRENT_DATE::text;
    v_message TEXT;
    v_generated INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO v_unassigned_count
    FROM public.leads
    WHERE workspace_id = p_workspace_id AND assigned_to IS NULL AND status = 'active' AND deleted_at IS NULL AND archived_at IS NULL;

    FOR v_member IN
        SELECT user_id, role FROM public.workspace_members
        WHERE workspace_id = p_workspace_id AND status = 'active'
    LOOP
        SELECT COUNT(*) INTO v_due_count
        FROM public.follow_ups f
        JOIN public.leads l ON l.id = f.lead_id
        WHERE f.workspace_id = p_workspace_id
          AND f.assigned_to = v_member.user_id
          AND f.status = 'pending'
          AND f.due_date::date = CURRENT_DATE
          AND l.deleted_at IS NULL
          AND l.archived_at IS NULL;

        SELECT COUNT(*) INTO v_overdue_count
        FROM public.follow_ups f
        JOIN public.leads l ON l.id = f.lead_id
        WHERE f.workspace_id = p_workspace_id
          AND f.assigned_to = v_member.user_id
          AND f.status = 'pending'
          AND f.due_date::date < CURRENT_DATE
          AND l.deleted_at IS NULL
          AND l.archived_at IS NULL;

        IF v_member.role IN ('owner', 'manager') THEN
            v_message := v_due_count || ' follow-ups due today, ' || v_overdue_count || ' overdue, ' || v_unassigned_count || ' unassigned leads.';
        ELSE
            v_message := v_due_count || ' follow-ups due today, ' || v_overdue_count || ' overdue.';
        END IF;

        IF public.create_notification_for_user(
            p_workspace_id,
            v_member.user_id,
            'daily_digest',
            'Daily Workspace Digest 📋',
            v_message,
            'digest',
            NULL,
            'daily_digest:' || v_member.user_id::text || ':' || v_today_date,
            jsonb_build_object('due_today', v_due_count, 'overdue', v_overdue_count, 'unassigned', v_unassigned_count)
        ) IS NOT NULL THEN
            v_generated := v_generated + 1;
        END IF;
    END LOOP;

    RETURN v_generated;
END;
$$;

-------------------------------------------------------
-- 7. EXPLICIT EXECUTE PERMISSION GRANTS
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.soft_delete_lead_rpc(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_deleted_lead_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_public_form_submission_rpc(uuid, uuid, text, text, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.change_lead_stage_rpc(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_due_and_overdue_notifications(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_daily_digest_for_workspace(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.soft_delete_lead_rpc(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_lead_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_public_form_submission_rpc(uuid, uuid, text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_lead_stage_rpc(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_and_overdue_notifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_daily_digest_for_workspace(uuid) TO authenticated;
