-- Noverlyn Phase 4 Migration: Remove Member Workflow & Status Support
-- Timestamp: 20260731000007

-------------------------------------------------------
-- 1. UPDATE WORKSPACE_MEMBERS STATUS CHECK CONSTRAINT
-------------------------------------------------------
ALTER TABLE public.workspace_members
DROP CONSTRAINT IF EXISTS workspace_members_status_check;

ALTER TABLE public.workspace_members
ADD CONSTRAINT workspace_members_status_check
CHECK (status IN ('invited', 'active', 'disabled', 'removed'));

-------------------------------------------------------
-- 2. REMOVE WORKSPACE MEMBER RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_workspace_member_rpc(
    p_workspace_id UUID,
    p_target_user_id UUID
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
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    v_caller_role := public.get_workspace_role(p_workspace_id);
    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only workspace owners and managers can remove team members';
    END IF;

    SELECT * INTO v_target FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Target member not found';
    END IF;

    -- Owners cannot be removed
    IF v_target.role = 'owner' THEN
        RAISE EXCEPTION 'Workspace owner cannot be removed';
    END IF;

    -- Self-removal check
    IF p_target_user_id = v_caller_id THEN
        RAISE EXCEPTION 'Cannot remove yourself through member removal action';
    END IF;

    -- Managers cannot remove Managers or Owners
    IF v_caller_role = 'manager' AND v_target.role IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Managers can only remove Agents';
    END IF;

    -- Update member status to removed
    UPDATE public.workspace_members
    SET status = 'removed',
        updated_at = NOW()
    WHERE id = v_target.id;
END;
$$;

-------------------------------------------------------
-- 3. UPDATE ACCEPT INVITATION RPC (Support Re-inviting Removed Members)
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

    IF v_inv.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invitation is no longer valid.';
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

    -- Insert or activate workspace member (handles previously removed member safely)
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
-- REVOKE PUBLIC EXECUTE & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.remove_workspace_member_rpc(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member_rpc(UUID, UUID) TO authenticated;
