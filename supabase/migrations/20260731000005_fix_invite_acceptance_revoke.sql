-- Noverlyn Phase 4 Hotfix Migration #2: Fix Invite Acceptance Performance & Revoke Invitation
-- Timestamp: 20260731000005

-------------------------------------------------------
-- 1. SCHEMA ADDITIONS (Soft Revocation Column)
-------------------------------------------------------
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_revoked_at
    ON public.invitations(workspace_id, revoked_at);

-------------------------------------------------------
-- 2. UPDATE ACCEPT INVITATION RPC (With Revocation Check)
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
-- 3. UPDATE REVOKE WORKSPACE INVITATION RPC
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
        RAISE EXCEPTION 'Access denied: caller is not an active member of this workspace';
    END IF;

    v_caller_role := public.get_workspace_role(v_inv.workspace_id);
    IF v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only owners and managers can revoke invitations';
    END IF;

    IF v_caller_role = 'manager' AND v_inv.role = 'manager' THEN
        RAISE EXCEPTION 'Managers cannot revoke Manager invitations';
    END IF;

    -- Perform explicit soft revocation
    UPDATE public.invitations
    SET revoked_at = NOW()
    WHERE id = p_invitation_id;
END;
$$;

-------------------------------------------------------
-- REVOKE PUBLIC EXECUTE & GRANT TO AUTHENTICATED
-------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.accept_invitation_rpc(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_rpc(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_workspace_invitation_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invitation_rpc(UUID) TO authenticated;
