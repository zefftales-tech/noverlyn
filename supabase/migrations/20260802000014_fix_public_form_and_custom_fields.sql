-- Noverlyn Phase 8A.1 Migration: Fix Public Form Submission & Add Custom Fields (Hardened Rerun-Safe)
-- Timestamp: 20260802000014

-------------------------------------------------------
-- 1. ADD CUSTOM FIELDS & PUBLIC FORM DATA COLUMNS
-------------------------------------------------------
ALTER TABLE public.lead_forms
ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS public_form_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-------------------------------------------------------
-- 2. REMOVE OBSOLETE 8-ARGUMENT FUNCTION OVERLOAD
-------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_public_lead_form_rpc(
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    text
);

-------------------------------------------------------
-- 3. UPDATE GET_PUBLIC_LEAD_FORM_RPC TO RETURN CUSTOM FIELDS
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_lead_form_rpc(
    p_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_form RECORD;
    v_ws RECORD;
BEGIN
    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RAISE EXCEPTION 'Form slug is required';
    END IF;

    SELECT lf.* INTO v_form
    FROM public.lead_forms lf
    WHERE lower(lf.slug) = lower(trim(p_slug));

    IF v_form.id IS NULL THEN
        -- Fallback: try finding workspace by slug directly and auto-seeding form
        SELECT w.id INTO v_ws
        FROM public.workspaces w
        WHERE lower(w.slug) = lower(trim(p_slug));

        IF v_ws.id IS NOT NULL THEN
            PERFORM public.seed_workspace_lead_form(v_ws.id);
            SELECT lf.* INTO v_form
            FROM public.lead_forms lf
            WHERE lower(lf.slug) = lower(trim(p_slug));
        END IF;
    END IF;

    IF v_form.id IS NULL OR NOT v_form.is_active THEN
        RAISE EXCEPTION 'Lead form not found or is currently inactive';
    END IF;

    SELECT w.name, w.business_type, w.currency
    INTO v_ws
    FROM public.workspaces w
    WHERE w.id = v_form.workspace_id;

    RETURN jsonb_build_object(
        'form_id', v_form.id,
        'workspace_id', v_form.workspace_id,
        'workspace_name', v_ws.name,
        'business_type', COALESCE(v_ws.business_type, 'real_estate'),
        'currency', COALESCE(v_ws.currency, 'USD'),
        'title', v_form.title,
        'description', v_form.description,
        'is_active', v_form.is_active,
        'show_email', v_form.show_email,
        'show_source', v_form.show_source,
        'show_budget', v_form.show_budget,
        'custom_fields', COALESCE(v_form.custom_fields, '[]'::jsonb)
    );
END;
$$;

-------------------------------------------------------
-- 4. HARDENED & ISOLATED 9-ARGUMENT SUBMIT_PUBLIC_LEAD_FORM_RPC
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
    -- 1. Bot Honeypot Check: if filled, silently return dummy success
    IF p_honeypot IS NOT NULL AND trim(p_honeypot) <> '' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Submission received');
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

    IF v_form.id IS NULL OR NOT v_form.is_active THEN
        RAISE EXCEPTION 'Form not found or is currently inactive';
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

            -- Skip inactive fields
            IF NOT v_is_active THEN
                CONTINUE;
            END IF;

            -- Extract user answer
            v_user_val := p_custom_answers->v_field_key;

            -- Check required field constraint
            IF v_is_required AND (v_user_val IS NULL OR v_user_val = 'null'::jsonb OR trim(v_user_val::text, '" ') = '') THEN
                RAISE EXCEPTION 'Please answer required custom question: %', v_field_label;
            END IF;

            -- Validate field types & option bounds if answered
            IF v_user_val IS NOT NULL AND v_user_val <> 'null'::jsonb THEN
                v_val_str := trim(v_user_val::text, '"');

                IF v_field_type = 'select' AND v_allowed_options IS NOT NULL AND jsonb_array_length(v_allowed_options) > 0 THEN
                    IF NOT (v_allowed_options @> jsonb_build_array(v_val_str)) THEN
                        RAISE EXCEPTION 'Invalid selection for question "%"', v_field_label;
                    END IF;
                END IF;

                -- Length limits
                IF length(v_val_str) > 4000 THEN
                    v_val_str := substring(v_val_str from 1 for 4000);
                END IF;

                v_sanitized_answers := jsonb_set(
                    v_sanitized_answers,
                    ARRAY[v_field_key],
                    jsonb_build_object(
                        'label', v_field_label,
                        'type', v_field_type,
                        'value', v_val_str
                    )
                );
            END IF;
        END LOOP;
    END IF;

    -- 5. Duplicate Check (Phone or Email in same workspace)
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

    -- 6. Determine first active stage for workspace
    SELECT stage_key INTO v_first_stage
    FROM public.pipeline_stages
    WHERE workspace_id = v_form.workspace_id
    ORDER BY position ASC
    LIMIT 1;

    IF v_first_stage IS NULL THEN
        v_first_stage := 'new';
    END IF;

    -- 7. Insert Lead into Workspace
    INSERT INTO public.leads (
        workspace_id, full_name, phone, email, source, requirement, estimated_value, priority, stage, status, public_form_data, created_at, updated_at
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
        jsonb_build_object(
            'form_title', v_form.title,
            'source_detail', COALESCE(p_source, 'direct'),
            'submitted_at', NOW(),
            'answers', v_sanitized_answers
        ),
        NOW(),
        NOW()
    )
    RETURNING id INTO v_lead_id;

    -- 8. Log Activity
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

    -- 9. Increment Submission Count
    UPDATE public.lead_forms
    SET submission_count = submission_count + 1,
        updated_at = NOW()
    WHERE id = v_form.id;

    -- 10. NON-BLOCKING Notification Trigger Boundary
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_workspace_role_notifications') THEN
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
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Notification failure must NEVER roll back successful lead creation
        RAISE WARNING 'Public lead form notification dispatch skipped: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'is_duplicate', v_is_duplicate
    );
END;
$$;

-------------------------------------------------------
-- 5. UPDATE UPDATE_LEAD_FORM_RPC TO SUPPORT CUSTOM FIELDS
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_lead_form_rpc(
    p_workspace_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_is_active BOOLEAN,
    p_show_email BOOLEAN,
    p_show_source BOOLEAN,
    p_show_budget BOOLEAN,
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
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_role := public.get_workspace_role(p_workspace_id);
    IF v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only Owners and Managers can configure lead forms';
    END IF;

    -- Ensure form exists
    PERFORM public.seed_workspace_lead_form(p_workspace_id);

    UPDATE public.lead_forms
    SET title = trim(COALESCE(p_title, 'Get in Touch')),
        description = CASE WHEN p_description IS NOT NULL THEN trim(p_description) ELSE NULL END,
        is_active = COALESCE(p_is_active, TRUE),
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
-- 6. EXPLICIT UNAMBIGUOUS EXECUTE GRANTS FOR PUBLIC & AUTHENTICATED USERS
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_public_lead_form_rpc(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_public_lead_form_rpc(text, text, text, text, text, text, numeric, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_lead_form_rpc(uuid, text, text, boolean, boolean, boolean, boolean, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_lead_form_rpc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_lead_form_rpc(text, text, text, text, text, text, numeric, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_lead_form_rpc(uuid, text, text, boolean, boolean, boolean, boolean, jsonb) TO authenticated;
