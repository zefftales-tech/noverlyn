-- Noverlyn Phase 4 Hotfix Migration #3: Fast Invitation Token Validation RPC
-- Timestamp: 20260731000006

-------------------------------------------------------
-- 1. FAST LIGHTWEIGHT INVITATION STATUS RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_status_rpc(
    p_raw_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_inv RECORD;
BEGIN
    IF p_raw_token IS NULL OR trim(p_raw_token) = '' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    v_token_hash := encode(sha256(p_raw_token::bytea), 'hex');

    SELECT i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, w.name AS workspace_name
    INTO v_inv
    FROM public.invitations i
    JOIN public.workspaces w ON w.id = i.workspace_id
    WHERE i.token_hash = v_token_hash;

    IF v_inv.id IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    IF v_inv.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'revoked',
            'workspace_name', v_inv.workspace_name
        );
    END IF;

    IF v_inv.accepted_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'accepted',
            'workspace_name', v_inv.workspace_name,
            'workspace_id', v_inv.workspace_id
        );
    END IF;

    IF v_inv.expires_at <= NOW() THEN
        RETURN jsonb_build_object(
            'status', 'expired',
            'workspace_name', v_inv.workspace_name
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'valid',
        'workspace_name', v_inv.workspace_name,
        'workspace_id', v_inv.workspace_id,
        'email', v_inv.email,
        'role', v_inv.role
    );
END;
$$;

-------------------------------------------------------
-- GRANT PUBLIC & AUTHENTICATED EXECUTE ACCESS
-------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_invitation_status_rpc(TEXT) TO public, authenticated;
