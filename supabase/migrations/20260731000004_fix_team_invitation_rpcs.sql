-- Noverlyn Phase 4 Hotfix Migration: Fix Team Invitation & Role Management RPC Type Casts
-- Timestamp: 20260731000004

-------------------------------------------------------
-- 1. FIX CREATE WORKSPACE INVITATION RPC
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
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    v_caller_role := public.get_workspace_role(p_workspace_id);
    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only workspace owners and managers can invite team members';
    END IF;

    IF p_role NOT IN ('manager', 'agent') THEN
        RAISE EXCEPTION 'Invalid invitation role: %', p_role;
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
        p_workspace_id, v_clean_email, p_role, v_token_hash, NOW() + INTERVAL '7 days', v_caller_id
    );

    RETURN v_raw_token;
END;
$$;

-------------------------------------------------------
-- 2. FIX UPDATE WORKSPACE MEMBER ROLE RPC
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
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = v_target.id;
END;
$$;

-------------------------------------------------------
-- 3. FIX SET WORKSPACE MEMBER STATUS RPC
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
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = v_target.id;
END;
$$;
