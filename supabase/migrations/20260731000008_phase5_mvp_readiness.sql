-- Noverlyn Phase 5 Migration: CSV Lead Import & Bulk Operations RPCs
-- Timestamp: 20260731000008

-------------------------------------------------------
-- 1. SEARCH INDEXES FOR LEAD DUP CHECK & SEARCH
-------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_workspace_phone
    ON public.leads(workspace_id, lower(trim(phone)));

CREATE INDEX IF NOT EXISTS idx_leads_workspace_email
    ON public.leads(workspace_id, lower(trim(email)))
    WHERE email IS NOT NULL;

-------------------------------------------------------
-- 2. BULK UPDATE LEADS RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_update_leads_rpc(
    p_workspace_id UUID,
    p_lead_ids UUID[],
    p_updates JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_count INTEGER := 0;
    v_new_stage TEXT;
    v_new_priority TEXT;
    v_new_assigned_to UUID;
    v_new_status TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) = 0 THEN
        RETURN 0;
    END IF;

    v_new_stage := p_updates->>'stage';
    v_new_priority := p_updates->>'priority';
    v_new_status := p_updates->>'status';
    
    IF (p_updates->>'assigned_to') IS NOT NULL AND (p_updates->>'assigned_to') <> '' THEN
        v_new_assigned_to := (p_updates->>'assigned_to')::UUID;
    END IF;

    -- Validate assigned_to is active member of workspace if specified
    IF v_new_assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = p_workspace_id
              AND user_id = v_new_assigned_to
              AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Assigned agent must be an active workspace member';
        END IF;
    END IF;

    UPDATE public.leads
    SET stage = COALESCE(v_new_stage, stage),
        priority = COALESCE(v_new_priority, priority),
        status = COALESCE(v_new_status, status),
        assigned_to = CASE WHEN p_updates ? 'assigned_to' THEN v_new_assigned_to ELSE assigned_to END,
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id
      AND id = ANY(p_lead_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-------------------------------------------------------
-- 3. CSV BATCH IMPORT LEADS RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_leads_rpc(
    p_workspace_id UUID,
    p_leads JSONB,
    p_skip_duplicates BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_lead RECORD;
    v_imported_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_assigned_user_id UUID;
    v_lead_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    FOR v_lead IN SELECT * FROM jsonb_to_recordset(p_leads) AS x(
        full_name TEXT,
        phone TEXT,
        email TEXT,
        source TEXT,
        priority TEXT,
        stage TEXT,
        budget_min NUMERIC,
        budget_max NUMERIC,
        estimated_value NUMERIC,
        requirement TEXT,
        notes TEXT,
        assigned_agent_email TEXT
    ) LOOP
        BEGIN
            -- Validate minimum required fields
            IF v_lead.full_name IS NULL OR trim(v_lead.full_name) = '' THEN
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;

            v_clean_phone := COALESCE(trim(v_lead.phone), '');
            v_clean_email := lower(trim(COALESCE(v_lead.email, '')));
            IF v_clean_email = '' THEN v_clean_email := NULL; END IF;

            -- Check duplicate in workspace if p_skip_duplicates is TRUE
            IF p_skip_duplicates THEN
                IF (v_clean_phone <> '' AND EXISTS (
                    SELECT 1 FROM public.leads
                    WHERE workspace_id = p_workspace_id
                      AND lower(trim(phone)) = lower(v_clean_phone)
                )) OR (v_clean_email IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.leads
                    WHERE workspace_id = p_workspace_id
                      AND lower(trim(email)) = v_clean_email
                )) THEN
                    v_skipped_count := v_skipped_count + 1;
                    CONTINUE;
                END IF;
            END IF;

            -- Lookup assigned agent user ID by email if provided
            v_assigned_user_id := NULL;
            IF v_lead.assigned_agent_email IS NOT NULL AND trim(v_lead.assigned_agent_email) <> '' THEN
                SELECT wm.user_id INTO v_assigned_user_id
                FROM public.workspace_members wm
                JOIN auth.users u ON u.id = wm.user_id
                WHERE wm.workspace_id = p_workspace_id
                  AND wm.status = 'active'
                  AND lower(trim(u.email)) = lower(trim(v_lead.assigned_agent_email));
            END IF;

            -- Insert Lead
            INSERT INTO public.leads (
                workspace_id,
                full_name,
                phone,
                email,
                source,
                priority,
                stage,
                status,
                budget_min,
                budget_max,
                estimated_value,
                requirement,
                assigned_to,
                created_by
            ) VALUES (
                p_workspace_id,
                trim(v_lead.full_name),
                COALESCE(v_clean_phone, 'Unspecified'),
                v_clean_email,
                COALESCE(v_lead.source, 'csv_import'),
                COALESCE(v_lead.priority, 'warm'),
                COALESCE(v_lead.stage, 'new'),
                'active',
                v_lead.budget_min,
                v_lead.budget_max,
                v_lead.estimated_value,
                v_lead.requirement,
                v_assigned_user_id,
                v_caller_id
            ) RETURNING id INTO v_lead_id;

            -- Insert initial note if provided
            IF v_lead.notes IS NOT NULL AND trim(v_lead.notes) <> '' THEN
                INSERT INTO public.lead_notes (workspace_id, lead_id, author_user_id, content)
                VALUES (p_workspace_id, v_lead_id, v_caller_id, trim(v_lead.notes));
            END IF;

            -- Insert initial activity
            INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, type, title, details)
            VALUES (p_workspace_id, v_lead_id, v_caller_id, 'lead_created', 'Lead Imported via CSV', 'Imported from CSV file');

            v_imported_count := v_imported_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'imported', v_imported_count,
        'skipped', v_skipped_count,
        'failed', v_failed_count
    );
END;
$$;

-------------------------------------------------------
-- REVOKE PUBLIC & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.bulk_update_leads_rpc(UUID, UUID[], JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_leads_rpc(UUID, UUID[], JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.import_leads_rpc(UUID, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_leads_rpc(UUID, JSONB, BOOLEAN) TO authenticated;
