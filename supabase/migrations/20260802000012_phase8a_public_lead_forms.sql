-- Noverlyn Phase 8A Migration: Public Lead Capture Forms
-- Timestamp: 20260802000012

-------------------------------------------------------
-- 1. LEAD FORMS TABLE
-------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Get in Touch',
    description TEXT NULL DEFAULT 'Fill out the form below and our team will get back to you shortly.',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    show_email BOOLEAN NOT NULL DEFAULT TRUE,
    show_source BOOLEAN NOT NULL DEFAULT TRUE,
    show_budget BOOLEAN NOT NULL DEFAULT TRUE,
    submission_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_lead_forms_workspace UNIQUE (workspace_id)
);

-- Expression-based unique index placed cleanly after table creation
DROP INDEX IF EXISTS public.uk_lead_forms_slug;
DROP INDEX IF EXISTS public.idx_lead_forms_slug;

CREATE UNIQUE INDEX uk_lead_forms_slug
ON public.lead_forms (lower(slug));

CREATE INDEX IF NOT EXISTS idx_lead_forms_workspace
ON public.lead_forms (workspace_id);

-------------------------------------------------------
-- 2. SEED DEFAULT LEAD FORM HELPER FUNCTION
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_workspace_lead_form(
    p_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws_slug TEXT;
    v_ws_name TEXT;
BEGIN
    SELECT slug, name INTO v_ws_slug, v_ws_name FROM public.workspaces WHERE id = p_workspace_id;
    IF v_ws_slug IS NOT NULL THEN
        INSERT INTO public.lead_forms (
            workspace_id, slug, title, description, is_active, show_email, show_source, show_budget
        ) VALUES (
            p_workspace_id,
            lower(v_ws_slug),
            'Connect with ' || v_ws_name,
            'Send us your requirements and our team will get in touch with you shortly.',
            TRUE,
            TRUE,
            TRUE,
            TRUE
        )
        ON CONFLICT (workspace_id) DO NOTHING;
    END IF;
END;
$$;

-------------------------------------------------------
-- 3. SEED ALL EXISTING WORKSPACES
-------------------------------------------------------
DO $$
DECLARE
    v_ws RECORD;
BEGIN
    FOR v_ws IN SELECT id FROM public.workspaces LOOP
        PERFORM public.seed_workspace_lead_form(v_ws.id);
    END LOOP;
END;
$$;

-------------------------------------------------------
-- 4. UPDATE CREATE_WORKSPACE RPC TO SEED LEAD FORM
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

    -- 5. Seed Workspace Lead Form
    PERFORM public.seed_workspace_lead_form(v_workspace_id);

    -- Return created workspace record
    SELECT id, name, slug, owner_user_id, timezone, currency, business_type, created_at
    INTO v_workspace_record
    FROM public.workspaces
    WHERE id = v_workspace_id;

    RETURN to_jsonb(v_workspace_record);
END;
$$;

-------------------------------------------------------
-- 5. PUBLIC GET LEAD FORM INFO RPC (Unauthenticated Public Lookup)
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
        'show_budget', v_form.show_budget
    );
END;
$$;

-------------------------------------------------------
-- 6. PUBLIC SUBMIT LEAD FORM RPC (Unauthenticated Rate-Protected Ingestion)
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
    -- 1. Bot Honeypot Check: if filled, silently return dummy success without inserting
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
        workspace_id,
        full_name,
        phone,
        email,
        source,
        requirement,
        estimated_value,
        priority,
        stage,
        status,
        created_at,
        updated_at
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

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'is_duplicate', v_is_duplicate
    );
END;
$$;

-------------------------------------------------------
-- 7. UPDATE LEAD FORM RPC (Protected Management)
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_lead_form_rpc(
    p_workspace_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_is_active BOOLEAN,
    p_show_email BOOLEAN,
    p_show_source BOOLEAN,
    p_show_budget BOOLEAN
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
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_form;

    RETURN to_jsonb(v_form);
END;
$$;

-------------------------------------------------------
-- 8. RLS POLICIES FOR LEAD FORMS
-------------------------------------------------------
ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active workspace members can view lead forms" ON public.lead_forms;
CREATE POLICY "Active workspace members can view lead forms"
    ON public.lead_forms FOR SELECT
    USING (public.is_active_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Owners and managers can manage lead forms" ON public.lead_forms;
CREATE POLICY "Owners and managers can manage lead forms"
    ON public.lead_forms FOR ALL
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );
