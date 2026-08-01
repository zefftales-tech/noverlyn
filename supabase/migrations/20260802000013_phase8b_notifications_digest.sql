-- Noverlyn Phase 8B Migration: Follow-up Reminders, Notifications & Daily Digest (Hardened)
-- Timestamp: 20260802000013

-------------------------------------------------------
-- 1. NOTIFICATIONS TABLE
-------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT NULL,
    entity_id UUID NULL,
    dedupe_key TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ NULL
);

-- Indexing for fast user inbox lookup
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON public.notifications(workspace_id);

-- Normalized partial unique index for user-level deduplication
DROP INDEX IF EXISTS public.uk_notifications_dedupe;
CREATE UNIQUE INDEX uk_notifications_dedupe ON public.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-------------------------------------------------------
-- 2. NOTIFICATION PREFERENCES TABLE
-------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    public_form_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    assignment_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    followup_due_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    overdue_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    won_lost_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    daily_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_ws ON public.notification_preferences(user_id, workspace_id);

-------------------------------------------------------
-- 3. HELPER: GET OR SEED NOTIFICATION PREFERENCES
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_seed_notification_preferences(
    p_user_id UUID,
    p_workspace_id UUID
)
RETURNS TABLE (
    user_id UUID,
    workspace_id UUID,
    public_form_alerts BOOLEAN,
    assignment_alerts BOOLEAN,
    followup_due_alerts BOOLEAN,
    overdue_alerts BOOLEAN,
    won_lost_alerts BOOLEAN,
    daily_digest_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.notification_preferences (user_id, workspace_id)
    VALUES (p_user_id, p_workspace_id)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;

    RETURN QUERY
    SELECT np.user_id, np.workspace_id, np.public_form_alerts, np.assignment_alerts,
           np.followup_due_alerts, np.overdue_alerts, np.won_lost_alerts, np.daily_digest_enabled
    FROM public.notification_preferences np
    WHERE np.user_id = p_user_id AND np.workspace_id = p_workspace_id;
END;
$$;

-------------------------------------------------------
-- 4. SECURE RPC TO SAVE NOTIFICATION PREFERENCES
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_notification_preferences_rpc(
    p_workspace_id UUID,
    p_public_form_alerts BOOLEAN DEFAULT TRUE,
    p_assignment_alerts BOOLEAN DEFAULT TRUE,
    p_followup_due_alerts BOOLEAN DEFAULT TRUE,
    p_overdue_alerts BOOLEAN DEFAULT TRUE,
    p_won_lost_alerts BOOLEAN DEFAULT TRUE,
    p_daily_digest_enabled BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_pref RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied to this workspace';
    END IF;

    INSERT INTO public.notification_preferences (
        user_id, workspace_id, public_form_alerts, assignment_alerts,
        followup_due_alerts, overdue_alerts, won_lost_alerts, daily_digest_enabled, updated_at
    )
    VALUES (
        v_user_id, p_workspace_id,
        COALESCE(p_public_form_alerts, TRUE),
        COALESCE(p_assignment_alerts, TRUE),
        COALESCE(p_followup_due_alerts, TRUE),
        COALESCE(p_overdue_alerts, TRUE),
        COALESCE(p_won_lost_alerts, TRUE),
        COALESCE(p_daily_digest_enabled, TRUE),
        NOW()
    )
    ON CONFLICT (user_id, workspace_id) DO UPDATE SET
        public_form_alerts = EXCLUDED.public_form_alerts,
        assignment_alerts = EXCLUDED.assignment_alerts,
        followup_due_alerts = EXCLUDED.followup_due_alerts,
        overdue_alerts = EXCLUDED.overdue_alerts,
        won_lost_alerts = EXCLUDED.won_lost_alerts,
        daily_digest_enabled = EXCLUDED.daily_digest_enabled,
        updated_at = NOW()
    RETURNING * INTO v_pref;

    RETURN to_jsonb(v_pref);
END;
$$;

-------------------------------------------------------
-- 5. SECURE NOTIFICATION CREATION FOR A SINGLE USER
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
    p_workspace_id UUID,
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_dedupe_key TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pref RECORD;
    v_notification_id UUID;
    v_should_notify BOOLEAN := TRUE;
    v_clean_dedupe TEXT;
BEGIN
    -- 1. Ensure recipient is an active member of workspace
    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = p_user_id
          AND status = 'active'
    ) THEN
        RETURN NULL;
    END IF;

    -- 2. Check recipient notification preferences
    SELECT * INTO v_pref FROM public.get_or_seed_notification_preferences(p_user_id, p_workspace_id);

    IF p_type = 'public_form_lead' AND NOT COALESCE(v_pref.public_form_alerts, TRUE) THEN v_should_notify := FALSE; END IF;
    IF p_type = 'lead_assigned' AND NOT COALESCE(v_pref.assignment_alerts, TRUE) THEN v_should_notify := FALSE; END IF;
    IF p_type = 'followup_due' AND NOT COALESCE(v_pref.followup_due_alerts, TRUE) THEN v_should_notify := FALSE; END IF;
    IF p_type = 'followup_overdue' AND NOT COALESCE(v_pref.overdue_alerts, TRUE) THEN v_should_notify := FALSE; END IF;
    IF (p_type = 'lead_won' OR p_type = 'lead_lost') AND NOT COALESCE(v_pref.won_lost_alerts, TRUE) THEN v_should_notify := FALSE; END IF;
    IF p_type = 'daily_digest' AND NOT COALESCE(v_pref.daily_digest_enabled, TRUE) THEN v_should_notify := FALSE; END IF;

    IF NOT v_should_notify THEN
        RETURN NULL;
    END IF;

    v_clean_dedupe := CASE WHEN p_dedupe_key IS NOT NULL AND trim(p_dedupe_key) <> '' THEN lower(trim(p_dedupe_key)) ELSE NULL END;

    -- 3. Insert notification with dedupe protection
    INSERT INTO public.notifications (
        workspace_id, user_id, type, title, message, entity_type, entity_id, dedupe_key, metadata
    )
    VALUES (
        p_workspace_id,
        p_user_id,
        trim(p_type),
        trim(p_title),
        trim(p_message),
        p_entity_type,
        p_entity_id,
        v_clean_dedupe,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-------------------------------------------------------
-- 6. SECURE NOTIFICATION CREATION FOR WORKSPACE ROLES
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace_role_notifications(
    p_workspace_id UUID,
    p_roles TEXT[],
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_dedupe_prefix TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_exclude_actor_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_member RECORD;
    v_count INTEGER := 0;
    v_dedupe_key TEXT;
BEGIN
    FOR v_member IN
        SELECT user_id FROM public.workspace_members
        WHERE workspace_id = p_workspace_id
          AND status = 'active'
          AND role = ANY(p_roles)
    LOOP
        -- Skip self-notification for routine actor actions
        IF p_exclude_actor_id IS NOT NULL AND v_member.user_id = p_exclude_actor_id THEN
            CONTINUE;
        END IF;

        v_dedupe_key := CASE
            WHEN p_dedupe_prefix IS NOT NULL THEN lower(p_dedupe_prefix || ':' || v_member.user_id::text)
            ELSE NULL
        END;

        IF public.create_notification_for_user(
            p_workspace_id,
            v_member.user_id,
            p_type,
            p_title,
            p_message,
            p_entity_type,
            p_entity_id,
            v_dedupe_key,
            p_metadata
        ) IS NOT NULL THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

-------------------------------------------------------
-- 7. PUBLIC FORM SUBMISSION WITH FULL PHASE 8A COMPATIBILITY & NOTIFICATION
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_lead_form_rpc(
    p_slug TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_requirement TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_budget NUMERIC DEFAULT NULL,
    p_honeypot TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_form RECORD;
    v_first_stage TEXT := 'new';
    v_lead_id UUID;
    v_is_duplicate BOOLEAN := FALSE;
    v_clean_phone TEXT;
    v_clean_email TEXT;
BEGIN
    -- 1. Bot Honeypot Check
    IF p_honeypot IS NOT NULL AND trim(p_honeypot) <> '' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Submission received');
    END IF;

    -- 2. Validate Inputs
    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RAISE EXCEPTION 'Form slug is required';
    END IF;

    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name is required';
    END IF;

    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RAISE EXCEPTION 'Phone number is required';
    END IF;

    -- 3. Lookup Lead Form
    SELECT lf.* INTO v_form
    FROM public.lead_forms lf
    WHERE lower(lf.slug) = lower(trim(p_slug));

    IF v_form.id IS NULL OR NOT v_form.is_active THEN
        RAISE EXCEPTION 'Form not found or is currently inactive';
    END IF;

    v_clean_phone := trim(p_phone);
    v_clean_email := CASE WHEN p_email IS NOT NULL AND trim(p_email) <> '' THEN lower(trim(p_email)) ELSE NULL END;

    -- 4. Check for duplicate lead in same workspace (same phone or same email)
    IF EXISTS (
        SELECT 1 FROM public.leads
        WHERE workspace_id = v_form.workspace_id
          AND (
              (phone IS NOT NULL AND phone = v_clean_phone)
              OR (v_clean_email IS NOT NULL AND lower(email) = v_clean_email)
          )
    ) THEN
        v_is_duplicate := TRUE;
    END IF;

    -- 5. Determine first active stage for workspace
    SELECT stage_key INTO v_first_stage
    FROM public.pipeline_stages
    WHERE workspace_id = v_form.workspace_id
    ORDER BY position ASC
    LIMIT 1;

    IF v_first_stage IS NULL THEN
        v_first_stage := 'new';
    END IF;

    -- 6. Insert Lead into Workspace
    INSERT INTO public.leads (
        workspace_id, full_name, phone, email, source, requirement, estimated_value, priority, stage, status, created_at, updated_at
    )
    VALUES (
        v_form.workspace_id,
        trim(p_full_name),
        v_clean_phone,
        v_clean_email,
        'Public Form',
        CASE WHEN p_requirement IS NOT NULL AND trim(p_requirement) <> '' THEN trim(p_requirement) ELSE NULL END,
        p_budget,
        'warm',
        v_first_stage,
        'active',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_lead_id;

    -- 7. Log Activity
    INSERT INTO public.activities (
        workspace_id, lead_id, actor_user_id, activity_type, metadata
    )
    VALUES (
        v_form.workspace_id,
        v_lead_id,
        NULL,
        'lead_created',
        jsonb_build_object(
            'source', 'Public Form',
            'channel_detail', COALESCE(p_source, 'direct'),
            'possible_duplicate', v_is_duplicate
        )
    );

    -- 8. Increment Submission Count
    UPDATE public.lead_forms
    SET submission_count = submission_count + 1,
        updated_at = NOW()
    WHERE id = v_form.id;

    -- 9. Trigger Notifications for Owners & Managers
    PERFORM public.create_workspace_role_notifications(
        v_form.workspace_id,
        ARRAY['owner', 'manager']::text[],
        'public_form_lead',
        'New Public Form Inquiry',
        trim(p_full_name) || ' submitted an inquiry via ' || COALESCE(v_form.title, 'Public Form'),
        'lead',
        v_lead_id,
        'public_lead:' || v_lead_id::text,
        jsonb_build_object('lead_id', v_lead_id, 'lead_name', p_full_name, 'source', COALESCE(p_source, 'direct'))
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'is_duplicate', v_is_duplicate
    );
END;
$$;

-------------------------------------------------------
-- 8. LEAD STAGE CHANGE RPC UPDATE WITH WON / LOST NOTIFICATIONS
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
    v_actor_name TEXT := 'A team member';
    v_stage_info RECORD;
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
        IF v_lead.assigned_user_id IS NOT NULL AND v_lead.assigned_user_id <> v_caller_id THEN
            PERFORM public.create_notification_for_user(
                v_lead.workspace_id, v_lead.assigned_user_id, 'lead_won', 'Your Deal Was Won! 🎉',
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
-- 9. FOLLOW-UP REMINDER GENERATION RPC
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
        SELECT f.id, f.workspace_id, f.lead_id, f.assigned_user_id, f.follow_up_type, f.due_date, l.full_name as lead_name
        FROM public.follow_ups f
        JOIN public.leads l ON l.id = f.lead_id
        WHERE f.workspace_id = p_workspace_id
          AND f.status = 'pending'
          AND f.due_date::date = CURRENT_DATE
    LOOP
        IF v_fu.assigned_user_id IS NOT NULL THEN
            IF public.create_notification_for_user(
                v_fu.workspace_id,
                v_fu.assigned_user_id,
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
        SELECT f.id, f.workspace_id, f.lead_id, f.assigned_user_id, f.follow_up_type, f.due_date, l.full_name as lead_name
        FROM public.follow_ups f
        JOIN public.leads l ON l.id = f.lead_id
        WHERE f.workspace_id = p_workspace_id
          AND f.status = 'pending'
          AND f.due_date::date < CURRENT_DATE
    LOOP
        IF v_fu.assigned_user_id IS NOT NULL THEN
            IF public.create_notification_for_user(
                v_fu.workspace_id,
                v_fu.assigned_user_id,
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
-- 10. DAILY DIGEST GENERATION RPC
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
    WHERE workspace_id = p_workspace_id AND assigned_user_id IS NULL AND status = 'active';

    FOR v_member IN
        SELECT user_id, role FROM public.workspace_members
        WHERE workspace_id = p_workspace_id AND status = 'active'
    LOOP
        SELECT COUNT(*) INTO v_due_count
        FROM public.follow_ups
        WHERE workspace_id = p_workspace_id
          AND assigned_user_id = v_member.user_id
          AND status = 'pending'
          AND due_date::date = CURRENT_DATE;

        SELECT COUNT(*) INTO v_overdue_count
        FROM public.follow_ups
        WHERE workspace_id = p_workspace_id
          AND assigned_user_id = v_member.user_id
          AND status = 'pending'
          AND due_date::date < CURRENT_DATE;

        IF v_member.role IN ('owner', 'manager') THEN
            v_message := v_due_count || ' follow-ups due today, ' || v_overdue_count || ' overdue, ' || v_unassigned_count || ' unassigned leads.';
        ELSE
            v_message := v_due_count || ' follow-ups due today for you, ' || v_overdue_count || ' overdue.';
        END IF;

        IF public.create_notification_for_user(
            p_workspace_id,
            v_member.user_id,
            'daily_digest',
            'Your Daily Noverlyn Summary',
            v_message,
            'digest',
            p_workspace_id,
            'daily_digest:' || p_workspace_id::text || ':' || v_member.user_id::text || ':' || v_today_date,
            jsonb_build_object('due_today', v_due_count, 'overdue', v_overdue_count, 'unassigned', v_unassigned_count)
        ) IS NOT NULL THEN
            v_generated := v_generated + 1;
        END IF;
    END LOOP;

    RETURN v_generated;
END;
$$;

-------------------------------------------------------
-- 11. RLS POLICIES & PERMISSIONS FOR NOTIFICATIONS & PREFERENCES
-------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id AND public.is_active_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id AND public.is_active_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Users view own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users view own notification preferences"
    ON public.notification_preferences FOR SELECT
    USING (auth.uid() = user_id AND public.is_active_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Users insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users insert own notification preferences"
    ON public.notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id AND public.is_active_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Users update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users update own notification preferences"
    ON public.notification_preferences FOR UPDATE
    USING (auth.uid() = user_id AND public.is_active_workspace_member(workspace_id));

-- Explicit Role Grants & Revocations
REVOKE EXECUTE ON FUNCTION public.create_notification_for_user FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_workspace_role_notifications FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_notification_preferences_rpc FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_due_and_overdue_notifications FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_daily_digest_for_workspace FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_notification_preferences_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_for_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_role_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_and_overdue_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_daily_digest_for_workspace TO authenticated;
