-- Noverlyn Phase 5 Hotfix Migration: Fix CSV Lead Import Validation & Activity Schema
-- Timestamp: 20260731000009

-------------------------------------------------------
-- FIX CSV BATCH IMPORT LEADS RPC
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
    v_row_index INTEGER := 0;
    v_imported_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_errors JSONB := '[]'::jsonb;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_clean_priority TEXT;
    v_clean_stage TEXT;
    v_assigned_user_id UUID;
    v_lead_id UUID;
    v_err_msg TEXT;
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
        v_row_index := v_row_index + 1;
        BEGIN
            v_clean_name := trim(COALESCE(v_lead.full_name, ''));
            IF v_clean_name = '' THEN
                v_failed_count := v_failed_count + 1;
                v_errors := v_errors || jsonb_build_object(
                    'row', v_row_index,
                    'name', 'Unnamed Lead',
                    'reason', 'Lead name is required'
                );
                CONTINUE;
            END IF;

            v_clean_phone := COALESCE(trim(v_lead.phone), '');
            v_clean_email := lower(trim(COALESCE(v_lead.email, '')));
            IF v_clean_email = '' THEN v_clean_email := NULL; END IF;

            -- Priority normalization (hot/warm/cold)
            v_clean_priority := lower(trim(COALESCE(v_lead.priority, 'warm')));
            IF v_clean_priority NOT IN ('hot', 'warm', 'cold') THEN
                v_clean_priority := 'warm';
            END IF;

            -- Stage normalization (new/contacted/qualified/property_shared/viewing_scheduled/negotiation/won/lost)
            v_clean_stage := lower(trim(replace(COALESCE(v_lead.stage, 'new'), ' ', '_')));
            IF v_clean_stage NOT IN ('new', 'contacted', 'qualified', 'property_shared', 'viewing_scheduled', 'negotiation', 'won', 'lost') THEN
                v_clean_stage := 'new';
            END IF;

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
                v_clean_name,
                CASE WHEN v_clean_phone <> '' THEN v_clean_phone ELSE 'Unspecified' END,
                v_clean_email,
                COALESCE(trim(v_lead.source), 'csv_import'),
                v_clean_priority,
                v_clean_stage,
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

            -- Insert initial activity (uses correct activities schema: activity_type, metadata)
            INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
            VALUES (
                p_workspace_id,
                v_lead_id,
                v_caller_id,
                'lead_created',
                jsonb_build_object('title', 'Lead Imported via CSV', 'details', 'Imported from CSV file', 'source', COALESCE(v_lead.source, 'csv_import'))
            );

            v_imported_count := v_imported_count + 1;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
            v_failed_count := v_failed_count + 1;
            v_errors := v_errors || jsonb_build_object(
                'row', v_row_index,
                'name', COALESCE(v_clean_name, 'Row ' || v_row_index),
                'reason', COALESCE(v_err_msg, 'Invalid row data')
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'imported', v_imported_count,
        'skipped', v_skipped_count,
        'failed', v_failed_count,
        'errors', v_errors
    );
END;
$$;

-------------------------------------------------------
-- REVOKE PUBLIC EXECUTE & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.import_leads_rpc(UUID, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_leads_rpc(UUID, JSONB, BOOLEAN) TO authenticated;
