-- Noverlyn Phase 4 Migration: Pipeline, Team Operations, Invitations & Insights
-- Timestamp: 20260731000003

-------------------------------------------------------
-- 1. SCHEMA ADDITIONS
-------------------------------------------------------
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_leads_won_at
    ON public.leads(workspace_id, won_at);

CREATE INDEX IF NOT EXISTS idx_leads_lost_at
    ON public.leads(workspace_id, lost_at);

CREATE INDEX IF NOT EXISTS idx_invitations_token_hash
    ON public.invitations(token_hash);

-------------------------------------------------------
-- 2. UPDATE CHANGE STAGE RPC (With won_at Timestamp)
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
        SET stage = 'won',
            status = 'won',
            won_at = NOW(),
            last_activity_at = NOW()
        WHERE id = p_lead_id;

        INSERT INTO public.activities (workspace_id, lead_id, actor_user_id, activity_type, metadata)
        VALUES (
            v_lead.workspace_id, p_lead_id, v_caller_id, 'deal_won',
            jsonb_build_object('from_stage', v_lead.stage)
        );
    ELSE
        UPDATE public.leads
        SET stage = p_new_stage,
            status = 'active',
            last_activity_at = NOW()
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
-- 3. CREATE WORKSPACE INVITATION RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace_invitation_rpc(
    p_workspace_id UUID,
    p_email TEXT,
    p_role TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_clean_email TEXT;
    v_raw_token TEXT;
    v_token_hash TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_caller_role := public.get_workspace_role(p_workspace_id);
    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only workspace owners and managers can invite team members';
    END IF;

    IF p_role NOT IN ('manager', 'agent') THEN
        RAISE EXCEPTION 'Invalid invitation role';
    END IF;

    -- Managers cannot invite Managers
    IF v_caller_role = 'manager' AND p_role = 'manager' THEN
        RAISE EXCEPTION 'Managers can only invite Agents';
    END IF;

    v_clean_email := lower(trim(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'Email is required';
    END IF;

    -- Prevent duplicate active invitations for same email
    IF EXISTS (
        SELECT 1 FROM public.invitations
        WHERE workspace_id = p_workspace_id
          AND lower(trim(email)) = v_clean_email
          AND accepted_at IS NULL
          AND expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'An active invitation already exists for %', v_clean_email;
    END IF;

    -- Generate cryptographically secure token and hash
    v_raw_token := gen_random_uuid()::text || gen_random_uuid()::text;
    v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

    INSERT INTO public.invitations (
        workspace_id, email, role, token_hash, expires_at, invited_by
    )
    VALUES (
        p_workspace_id, v_clean_email, p_role::public.workspace_role, v_token_hash, NOW() + INTERVAL '7 days', v_caller_id
    );

    RETURN v_raw_token;
END;
$$;

-------------------------------------------------------
-- 4. ACCEPT INVITATION RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation_rpc(
    p_raw_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_email TEXT;
    v_token_hash TEXT;
    v_inv RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to accept invitation';
    END IF;

    -- Retrieve caller email from auth.users
    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
    IF v_caller_email IS NULL THEN
        RAISE EXCEPTION 'Caller user account not found';
    END IF;

    v_token_hash := encode(sha256(p_raw_token::bytea), 'hex');

    SELECT * INTO v_inv
    FROM public.invitations
    WHERE token_hash = v_token_hash;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invalid invitation link';
    END IF;

    IF v_inv.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invitation has already been accepted';
    END IF;

    IF v_inv.expires_at <= NOW() THEN
        RAISE EXCEPTION 'This invitation link has expired';
    END IF;

    -- Case-insensitive Email Binding Check
    IF lower(trim(v_inv.email)) <> lower(trim(v_caller_email)) THEN
        RAISE EXCEPTION 'This invitation was issued to % but you are signed in as %', v_inv.email, v_caller_email;
    END IF;

    -- Insert or activate workspace member
    INSERT INTO public.workspace_members (
        workspace_id, user_id, role, status, joined_at
    )
    VALUES (
        v_inv.workspace_id, v_caller_id, v_inv.role, 'active', NOW()
    )
    ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET role = v_inv.role,
        status = 'active',
        joined_at = NOW(),
        updated_at = NOW();

    -- Mark invitation accepted
    UPDATE public.invitations
    SET accepted_at = NOW()
    WHERE id = v_inv.id;

    RETURN v_inv.workspace_id;
END;
$$;

-------------------------------------------------------
-- 5. REVOKE INVITATION RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_workspace_invitation_rpc(
    p_invitation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_inv RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_inv FROM public.invitations WHERE id = p_invitation_id;
    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF NOT public.is_active_workspace_member(v_inv.workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_caller_role := public.get_workspace_role(v_inv.workspace_id);
    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only owners and managers can revoke invitations';
    END IF;

    IF v_caller_role = 'manager' AND v_inv.role = 'manager' THEN
        RAISE EXCEPTION 'Managers cannot revoke Manager invitations';
    END IF;

    DELETE FROM public.invitations WHERE id = p_invitation_id;
END;
$$;

-------------------------------------------------------
-- 6. UPDATE WORKSPACE MEMBER ROLE RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_workspace_member_role_rpc(
    p_workspace_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_target RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_caller_role := public.get_workspace_role(p_workspace_id);
    IF v_caller_role <> 'owner' THEN
        RAISE EXCEPTION 'Only workspace owner can change member roles';
    END IF;

    SELECT * INTO v_target FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Target workspace member not found';
    END IF;

    IF v_target.role = 'owner' THEN
        RAISE EXCEPTION 'Cannot modify workspace owner role';
    END IF;

    IF p_new_role NOT IN ('manager', 'agent') THEN
        RAISE EXCEPTION 'Invalid role specified';
    END IF;

    UPDATE public.workspace_members
    SET role = p_new_role::public.workspace_role,
        updated_at = NOW()
    WHERE id = v_target.id;
END;
$$;

-------------------------------------------------------
-- 7. SET WORKSPACE MEMBER STATUS RPC (Disable / Activate)
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_workspace_member_status_rpc(
    p_workspace_id UUID,
    p_target_user_id UUID,
    p_new_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_target RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_active_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    v_caller_role := public.get_workspace_role(p_workspace_id);
    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only owners and managers can update member status';
    END IF;

    SELECT * INTO v_target FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Target member not found';
    END IF;

    IF v_target.role = 'owner' THEN
        RAISE EXCEPTION 'Cannot disable workspace owner';
    END IF;

    IF v_caller_role = 'manager' AND v_target.role IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Managers cannot modify status of owners or managers';
    END IF;

    IF p_new_status NOT IN ('active', 'disabled') THEN
        RAISE EXCEPTION 'Invalid status specified';
    END IF;

    UPDATE public.workspace_members
    SET status = p_new_status::public.member_status,
        updated_at = NOW()
    WHERE id = v_target.id;
END;
$$;

-------------------------------------------------------
-- REVOKE PUBLIC EXECUTE & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_workspace_invitation_rpc(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation_rpc(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_invitation_rpc(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_rpc(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_workspace_invitation_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invitation_rpc(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_workspace_member_role_rpc(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_role_rpc(UUID, UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_workspace_member_status_rpc(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_workspace_member_status_rpc(UUID, UUID, TEXT) TO authenticated;
