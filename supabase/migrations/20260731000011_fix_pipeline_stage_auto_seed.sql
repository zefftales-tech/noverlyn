-- Noverlyn Production Hotfix Migration: Auto-seed missing pipeline stages on stage change
-- Timestamp: 20260731000011

-------------------------------------------------------
-- 1. SEED ALL EXISTING WORKSPACES (Backfill)
-------------------------------------------------------
DO $$
DECLARE
    v_ws RECORD;
BEGIN
    FOR v_ws IN SELECT id, business_type FROM public.workspaces LOOP
        PERFORM public.seed_workspace_pipeline_stages(v_ws.id, COALESCE(v_ws.business_type, 'real_estate'));
    END LOOP;
END;
$$;

-------------------------------------------------------
-- 2. UPDATE CHANGE_LEAD_STAGE_RPC WITH SELF-HEALING AUTO-SEED
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
    v_btype TEXT;
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

    -- Self-heal missing pipeline stages for legacy / unseeded workspaces
    IF v_stage.id IS NULL THEN
        SELECT business_type INTO v_btype FROM public.workspaces WHERE id = v_lead.workspace_id;
        PERFORM public.seed_workspace_pipeline_stages(v_lead.workspace_id, COALESCE(v_btype, 'real_estate'));

        SELECT * INTO v_stage FROM public.pipeline_stages
        WHERE workspace_id = v_lead.workspace_id AND stage_key = p_new_stage;
    END IF;

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
