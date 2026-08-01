-- Noverlyn Phase 8A.2 Migration: Public Form Review Inbox & Safe Lead Deletion System
-- Timestamp: 20260802000015

-------------------------------------------------------
-- 1. ADD SUBMISSION_MODE & FORM ARCHIVE COLUMNS TO LEAD_FORMS
-------------------------------------------------------
ALTER TABLE public.lead_forms
ADD COLUMN IF NOT EXISTS submission_mode TEXT NOT NULL DEFAULT 'review',
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS archived_by UUID NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Enforce valid submission_mode values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_lead_forms_submission_mode'
    ) THEN
        ALTER TABLE public.lead_forms
        ADD CONSTRAINT chk_lead_forms_submission_mode CHECK (submission_mode IN ('review', 'automatic'));
    END IF;
END $$;

-------------------------------------------------------
-- 2. CREATE PUBLIC_FORM_SUBMISSIONS TABLE
-------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.lead_forms(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    requirement TEXT NOT NULL,
    source TEXT NULL,
    source_detail TEXT NULL,
    budget NUMERIC NULL,
    custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    possible_duplicate BOOLEAN NOT NULL DEFAULT false,
    duplicate_lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ NULL,
    reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    rejection_reason TEXT NULL,
    approved_lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ NULL,
    deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_public_form_submissions_status CHECK (status IN ('pending', 'approved', 'rejected', 'spam', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_pfs_workspace ON public.public_form_submissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pfs_form ON public.public_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_pfs_status ON public.public_form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_pfs_submitted_at ON public.public_form_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pfs_phone ON public.public_form_submissions(phone);
CREATE INDEX IF NOT EXISTS idx_pfs_email ON public.public_form_submissions(email);
CREATE INDEX IF NOT EXISTS idx_pfs_approved_lead ON public.public_form_submissions(approved_lead_id);

-------------------------------------------------------
-- 3. ADD LIFECYCLE COLUMNS TO LEADS TABLE
-------------------------------------------------------
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS previous_stage_key TEXT NULL,
ADD COLUMN IF NOT EXISTS previous_assigned_to UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_workspace_active ON public.leads(workspace_id, status) WHERE deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_archived ON public.leads(workspace_id, archived_at) WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted ON public.leads(workspace_id, deleted_at) WHERE deleted_at IS NOT NULL;

-------------------------------------------------------
-- 4. RLS POLICIES FOR PUBLIC_FORM_SUBMISSIONS & LEADS
-------------------------------------------------------
ALTER TABLE public.public_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active workspace members view form submissions" ON public.public_form_submissions;
CREATE POLICY "Active workspace members view form submissions"
    ON public.public_form_submissions FOR SELECT
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );

DROP POLICY IF EXISTS "Owners and managers update form submissions" ON public.public_form_submissions;
CREATE POLICY "Owners and managers update form submissions"
    ON public.public_form_submissions FOR ALL
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );

-------------------------------------------------------
-- 5. UPDATE SUBMIT_PUBLIC_LEAD_FORM_RPC TO SUPPORT REVIEW MODE
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_lead_form_rpc(
    p_slug TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_requirement TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_budget NUMERIC DEFAULT NULL,
    p_honeypot TEXT DEFAULT NULL,
    p_custom_answers JSONB DEFAULT '{}'::jsonb
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
    v_submission_id UUID;
    v_duplicate_id UUID := NULL;
    v_is_duplicate BOOLEAN := FALSE;
    v_clean_phone TEXT;
    v_clean_email TEXT;

    -- Custom Field Validation Variables
    v_field JSONB;
    v_field_key TEXT;
    v_field_label TEXT;
    v_field_type TEXT;
    v_is_required BOOLEAN;
    v_is_active BOOLEAN;
    v_allowed_options JSONB;
    v_user_val JSONB;
    v_val_str TEXT;
    v_sanitized_answers JSONB := '{}'::jsonb;
BEGIN
    -- 1. Bot Honeypot Check
    IF p_honeypot IS NOT NULL AND trim(p_honeypot) <> '' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Inquiry received');
    END IF;

    -- 2. Validate Standard Inputs
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

    IF v_form.id IS NULL OR v_form.deleted_at IS NOT NULL OR v_form.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'This lead form is no longer available.';
    END IF;

    IF NOT v_form.is_active THEN
        RAISE EXCEPTION 'Submissions for this lead form are currently paused.';
    END IF;

    v_clean_phone := trim(p_phone);
    v_clean_email := CASE WHEN p_email IS NOT NULL AND trim(p_email) <> '' THEN lower(trim(p_email)) ELSE NULL END;

    -- 4. Server-Side Custom Field Validation & Sanitization
    IF v_form.custom_fields IS NOT NULL AND jsonb_array_length(v_form.custom_fields) > 0 THEN
        FOR v_field IN SELECT * FROM jsonb_array_elements(v_form.custom_fields) LOOP
            v_field_key := v_field->>'key';
            v_field_label := COALESCE(v_field->>'label', v_field_key);
            v_field_type := COALESCE(v_field->>'type', 'short_text');
            v_is_required := COALESCE((v_field->>'required')::boolean, false);
            v_is_active := COALESCE((v_field->>'is_active')::boolean, true);
            v_allowed_options := v_field->'options';

            IF NOT v_is_active THEN CONTINUE; END IF;

            v_user_val := p_custom_answers->v_field_key;

            IF v_is_required AND (v_user_val IS NULL OR v_user_val = 'null'::jsonb OR trim(v_user_val::text, '" ') = '') THEN
                RAISE EXCEPTION 'Please answer required custom question: %', v_field_label;
            END IF;

            IF v_user_val IS NOT NULL AND v_user_val <> 'null'::jsonb THEN
                v_val_str := trim(v_user_val::text, '"');

                IF v_field_type = 'select' AND v_allowed_options IS NOT NULL AND jsonb_array_length(v_allowed_options) > 0 THEN
                    IF NOT (v_allowed_options @> jsonb_build_array(v_val_str)) THEN
                        RAISE EXCEPTION 'Invalid selection for question "%"', v_field_label;
                    END IF;
                END IF;

                IF length(v_val_str) > 4000 THEN
                    v_val_str := substring(v_val_str from 1 for 4000);
                END IF;

                v_sanitized_answers := jsonb_set(
                    v_sanitized_answers,
                    ARRAY[v_field_key],
                    jsonb_build_object('label', v_field_label, 'type', v_field_type, 'value', v_val_str)
                );
            END IF;
        END LOOP;
    END IF;

    -- 5. Duplicate Check
    SELECT id INTO v_duplicate_id
    FROM public.leads
    WHERE workspace_id = v_form.workspace_id
      AND deleted_at IS NULL
      AND (
          (phone IS NOT NULL AND phone = v_clean_phone)
          OR (v_clean_email IS NOT NULL AND lower(email) = v_clean_email)
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_duplicate_id IS NOT NULL THEN
        v_is_duplicate := TRUE;
    END IF;

    -- 6. REVIEW MODE vs AUTOMATIC MODE DISPATCH
    IF COALESCE(v_form.submission_mode, 'review') = 'review' THEN
        -- Insert into public_form_submissions in PENDING status
        INSERT INTO public.public_form_submissions (
            workspace_id, form_id, status, full_name, phone, email, requirement,
            source, source_detail, budget, custom_answers, possible_duplicate, duplicate_lead_id, submitted_at
        )
        VALUES (
            v_form.workspace_id, v_form.id, 'pending', trim(p_full_name), v_clean_phone, v_clean_email,
            COALESCE(trim(p_requirement), 'No notes specified'), 'Public Form', COALESCE(p_source, 'direct'),
            p_budget, v_sanitized_answers, v_is_duplicate, v_duplicate_id, NOW()
        )
        RETURNING id INTO v_submission_id;

        -- Increment Submission Count
        UPDATE public.lead_forms
        SET submission_count = submission_count + 1, updated_at = NOW()
        WHERE id = v_form.id;

        -- Notify Owners & Managers
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_workspace_role_notifications') THEN
                PERFORM public.create_workspace_role_notifications(
                    v_form.workspace_id,
                    ARRAY['owner', 'manager']::text[],
                    'public_form_submission',
                    'New Form Submission Awaiting Review',
                    trim(p_full_name) || ' submitted an inquiry via ' || COALESCE(v_form.title, 'Public Form'),
                    'submission',
                    v_submission_id,
                    'pfs_review:' || v_submission_id::text,
                    jsonb_build_object('submission_id', v_submission_id, 'full_name', p_full_name)
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Review notification dispatch skipped: %', SQLERRM;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Thank you. Your inquiry has been received and is awaiting review.'
        );
    ELSE
        -- AUTOMATIC MODE: Immediate Lead Creation
        SELECT stage_key INTO v_first_stage
        FROM public.pipeline_stages
        WHERE workspace_id = v_form.workspace_id
        ORDER BY position ASC
        LIMIT 1;

        IF v_first_stage IS NULL THEN v_first_stage := 'new'; END IF;

        INSERT INTO public.leads (
            workspace_id, full_name, phone, email, source, requirement, estimated_value, priority, stage, status, public_form_data, created_at, updated_at
        )
        VALUES (
            v_form.workspace_id, trim(p_full_name), v_clean_phone, v_clean_email, 'Public Form',
            CASE WHEN p_requirement IS NOT NULL AND trim(p_requirement) <> '' THEN trim(p_requirement) ELSE NULL END,
            p_budget, 'warm', v_first_stage, 'active',
            jsonb_build_object('form_title', v_form.title, 'source_detail', COALESCE(p_source, 'direct'), 'submitted_at', NOW(), 'answers', v_sanitized_answers),
            NOW(), NOW()
        )
        RETURNING id INTO v_lead_id;

        -- Record submission entry as approved
        INSERT INTO public.public_form_submissions (
            workspace_id, form_id, status, full_name, phone, email, requirement,
            source, source_detail, budget, custom_answers, possible_duplicate, duplicate_lead_id, approved_lead_id, submitted_at, reviewed_at
        )
        VALUES (
            v_form.workspace_id, v_form.id, 'approved', trim(p_full_name), v_clean_phone, v_clean_email,
            COALESCE(trim(p_requirement), 'No notes specified'), 'Public Form', COALESCE(p_source, 'direct'),
            p_budget, v_sanitized_answers, v_is_duplicate, v_duplicate_id, v_lead_id, NOW(), NOW()
        );

        UPDATE public.lead_forms SET submission_count = submission_count + 1, updated_at = NOW() WHERE id = v_form.id;

        -- Notify Owners & Managers
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_workspace_role_notifications') THEN
                PERFORM public.create_workspace_role_notifications(
                    v_form.workspace_id,
                    ARRAY['owner', 'manager']::text[],
                    'public_form_lead',
                    'New Lead Created',
                    trim(p_full_name) || ' submitted an inquiry via ' || COALESCE(v_form.title, 'Public Form'),
                    'lead',
                    v_lead_id,
                    'public_lead:' || v_lead_id::text,
                    jsonb_build_object('lead_id', v_lead_id)
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Automatic notification dispatch skipped: %', SQLERRM;
        END;

        RETURN jsonb_build_object('success', true, 'message', 'Thank you. Your inquiry has been submitted successfully.');
    END IF;
END;
$$;

-------------------------------------------------------
-- 6. RPC: APPROVE_PUBLIC_FORM_SUBMISSION_RPC
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
    v_assignee_name TEXT;
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

    -- 1. Create Lead Record
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

    -- 3. Optional Follow-up & Note
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

    -- 5. Notify Assigned Agent
    IF p_assigned_to IS NOT NULL AND p_assigned_to <> v_caller_id THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_notification_for_user') THEN
                PERFORM public.create_notification_for_user(
                    v_sub.workspace_id,
                    p_assigned_to,
                    'lead_assigned',
                    'New Lead Assigned to You',
                    v_sub.full_name || ' was approved and assigned to you.',
                    'lead',
                    v_lead_id,
                    'lead_assign:' || v_lead_id::text,
                    jsonb_build_object('lead_id', v_lead_id)
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Assignee notification skipped: %', SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id, 'submission_id', p_submission_id);
END;
$$;

-------------------------------------------------------
-- 7. RPC: REJECT / SPAM / DELETE / RESTORE SUBMISSIONS
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_public_form_submission_status_rpc(
    p_submission_id UUID,
    p_target_status TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_sub RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_sub FROM public.public_form_submissions WHERE id = p_submission_id FOR UPDATE;
    IF v_sub.id IS NULL THEN RAISE EXCEPTION 'Submission not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_sub.workspace_id) AND public.get_workspace_role(v_sub.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF p_target_status NOT IN ('pending', 'rejected', 'spam', 'deleted') THEN
        RAISE EXCEPTION 'Invalid target submission status: %', p_target_status;
    END IF;

    UPDATE public.public_form_submissions
    SET status = p_target_status,
        rejection_reason = CASE WHEN p_target_status = 'rejected' THEN p_rejection_reason ELSE rejection_reason END,
        reviewed_by = v_caller_id,
        reviewed_at = NOW(),
        deleted_at = CASE WHEN p_target_status = 'deleted' THEN NOW() ELSE NULL END,
        deleted_by = CASE WHEN p_target_status = 'deleted' THEN v_caller_id ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_submission_id;

    RETURN jsonb_build_object('success', true, 'submission_id', p_submission_id, 'status', p_target_status);
END;
$$;

-------------------------------------------------------
-- 8. RPC: PERMANENTLY DELETE SUBMISSION (OWNER ONLY)
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permanently_delete_submission_rpc(
    p_submission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_sub RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_sub FROM public.public_form_submissions WHERE id = p_submission_id FOR UPDATE;
    IF v_sub.id IS NULL THEN RAISE EXCEPTION 'Submission not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_sub.workspace_id) AND public.get_workspace_role(v_sub.workspace_id) = 'owner') THEN
        RAISE EXCEPTION 'Only Workspace Owners can permanently delete form submissions';
    END IF;

    DELETE FROM public.public_form_submissions WHERE id = p_submission_id;

    RETURN jsonb_build_object('success', true, 'submission_id', p_submission_id);
END;
$$;

-------------------------------------------------------
-- 9. RPC: ARCHIVE & SOFT DELETE & RESTORE LEADS
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_lead_rpc(p_lead_id UUID)
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
        RAISE EXCEPTION 'Only Owners and Managers can archive leads';
    END IF;

    UPDATE public.leads
    SET archived_at = NOW(),
        archived_by = v_caller_id,
        updated_at = NOW()
    WHERE id = p_lead_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (v_lead.workspace_id, p_lead_id, v_caller_id, 'lead_archived', '{}'::jsonb);

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_archived_lead_rpc(p_lead_id UUID)
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
        RAISE EXCEPTION 'Only Owners and Managers can restore archived leads';
    END IF;

    UPDATE public.leads
    SET archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW()
    WHERE id = p_lead_id;

    INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
    VALUES (v_lead.workspace_id, p_lead_id, v_caller_id, 'lead_restored', '{}'::jsonb);

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

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
        RAISE EXCEPTION 'Only Owners and Managers can restore leads from Trash';
    END IF;

    -- Validate previous stage or fallback to first active stage
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

CREATE OR REPLACE FUNCTION public.permanently_delete_lead_rpc(
    p_lead_id UUID,
    p_confirmation TEXT
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

    IF UPPER(trim(p_confirmation)) <> 'DELETE' THEN
        RAISE EXCEPTION 'Confirmation mismatch. Type DELETE to confirm permanent removal.';
    END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
    IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_lead.workspace_id) AND public.get_workspace_role(v_lead.workspace_id) = 'owner') THEN
        RAISE EXCEPTION 'Only Workspace Owners can permanently delete leads';
    END IF;

    IF v_lead.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Lead must be moved to Trash before permanent deletion';
    END IF;

    -- Permanent cascade deletion
    DELETE FROM public.leads WHERE id = p_lead_id;

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-------------------------------------------------------
-- 10. UPDATE_LEAD_FORM_RPC WITH SUBMISSION_MODE
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_lead_form_rpc(
    p_workspace_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_is_active BOOLEAN,
    p_submission_mode TEXT DEFAULT 'review',
    p_show_email BOOLEAN DEFAULT TRUE,
    p_show_source BOOLEAN DEFAULT TRUE,
    p_show_budget BOOLEAN DEFAULT TRUE,
    p_custom_fields JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_role TEXT;
    v_form RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

    v_role := public.get_workspace_role(p_workspace_id);
    IF v_role NOT IN ('owner', 'manager') THEN RAISE EXCEPTION 'Only Owners and Managers can configure lead forms'; END IF;

    PERFORM public.seed_workspace_lead_form(p_workspace_id);

    UPDATE public.lead_forms
    SET title = trim(COALESCE(p_title, 'Get in Touch')),
        description = CASE WHEN p_description IS NOT NULL THEN trim(p_description) ELSE NULL END,
        is_active = COALESCE(p_is_active, TRUE),
        submission_mode = COALESCE(p_submission_mode, 'review'),
        show_email = COALESCE(p_show_email, TRUE),
        show_source = COALESCE(p_show_source, TRUE),
        show_budget = COALESCE(p_show_budget, TRUE),
        custom_fields = CASE WHEN p_custom_fields IS NOT NULL THEN p_custom_fields ELSE custom_fields END,
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_form;

    RETURN to_jsonb(v_form);
END;
$$;

-------------------------------------------------------
-- 11. FORM LIFECYCLE RPCS (ARCHIVE, RESTORE, SOFT-DELETE, PERMANENT DELETE)
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_lead_form_rpc(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_form RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_form FROM public.lead_forms WHERE id = p_form_id FOR UPDATE;
    IF v_form.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_form.workspace_id) AND public.get_workspace_role(v_form.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Workspace Owners and Managers can archive lead forms';
    END IF;

    UPDATE public.lead_forms
    SET archived_at = NOW(),
        archived_by = v_caller_id,
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_form_id;

    RETURN jsonb_build_object('success', true, 'form_id', p_form_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_archived_lead_form_rpc(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_form RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_form FROM public.lead_forms WHERE id = p_form_id FOR UPDATE;
    IF v_form.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_form.workspace_id) AND public.get_workspace_role(v_form.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Workspace Owners and Managers can restore archived lead forms';
    END IF;

    UPDATE public.lead_forms
    SET archived_at = NULL,
        archived_by = NULL,
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_form_id;

    RETURN jsonb_build_object('success', true, 'form_id', p_form_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_lead_form_rpc(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_form RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_form FROM public.lead_forms WHERE id = p_form_id FOR UPDATE;
    IF v_form.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_form.workspace_id) AND public.get_workspace_role(v_form.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Workspace Owners and Managers can move lead forms to Trash';
    END IF;

    UPDATE public.lead_forms
    SET deleted_at = NOW(),
        deleted_by = v_caller_id,
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_form_id;

    RETURN jsonb_build_object('success', true, 'form_id', p_form_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_deleted_lead_form_rpc(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_form RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_form FROM public.lead_forms WHERE id = p_form_id FOR UPDATE;
    IF v_form.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_form.workspace_id) AND public.get_workspace_role(v_form.workspace_id) IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Only Workspace Owners and Managers can restore deleted lead forms';
    END IF;

    UPDATE public.lead_forms
    SET deleted_at = NULL,
        deleted_by = NULL,
        archived_at = NULL,
        archived_by = NULL,
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_form_id;

    RETURN jsonb_build_object('success', true, 'form_id', p_form_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.permanently_delete_lead_form_rpc(
    p_form_id UUID,
    p_confirmation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_form RECORD;
    v_sub_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    IF UPPER(trim(p_confirmation)) <> 'DELETE' THEN
        RAISE EXCEPTION 'Confirmation mismatch. Type DELETE to confirm permanent removal.';
    END IF;

    SELECT * INTO v_form FROM public.lead_forms WHERE id = p_form_id FOR UPDATE;
    IF v_form.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;

    IF NOT (public.is_active_workspace_member(v_form.workspace_id) AND public.get_workspace_role(v_form.workspace_id) = 'owner') THEN
        RAISE EXCEPTION 'Only Workspace Owners can permanently delete lead forms';
    END IF;

    IF v_form.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Form must be moved to Trash before permanent deletion';
    END IF;

    -- History Protection Check: Cannot permanently delete forms with submission history
    SELECT COUNT(*) INTO v_sub_count FROM public.public_form_submissions WHERE form_id = p_form_id;
    IF v_sub_count > 0 THEN
        RAISE EXCEPTION 'This form has submission history and cannot be permanently deleted.';
    END IF;

    DELETE FROM public.lead_forms WHERE id = p_form_id;

    RETURN jsonb_build_object('success', true, 'form_id', p_form_id);
END;
$$;

-------------------------------------------------------
-- 12. EXPLICIT UNAMBIGUOUS EXECUTE GRANTS
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.approve_public_form_submission_rpc(uuid, uuid, text, text, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_public_form_submission_status_rpc(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.permanently_delete_submission_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_lead_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_archived_lead_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_lead_rpc(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_deleted_lead_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.permanently_delete_lead_rpc(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_lead_form_rpc(uuid, text, text, boolean, text, boolean, boolean, boolean, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_lead_form_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_archived_lead_form_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_lead_form_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_deleted_lead_form_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.permanently_delete_lead_form_rpc(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_public_form_submission_rpc(uuid, uuid, text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_public_form_submission_status_rpc(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_submission_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_lead_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_archived_lead_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead_rpc(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_lead_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_lead_rpc(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lead_form_rpc(uuid, text, text, boolean, text, boolean, boolean, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_lead_form_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_archived_lead_form_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead_form_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_lead_form_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_lead_form_rpc(uuid, text) TO authenticated;
