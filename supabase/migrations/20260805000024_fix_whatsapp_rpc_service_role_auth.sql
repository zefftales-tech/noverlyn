-- ============================================================================
-- CORRECTIVE MIGRATION: Fix WhatsApp Connection RPCs for Service Role Invocation
-- Migration: 20260805000024_fix_whatsapp_rpc_service_role_auth.sql
-- Safely drops old overloads by exact signature, establishes canonical service_role RPCs,
-- and uses exact argument list in REVOKE and GRANT statements.
-- ============================================================================

-- 1. DROP OBSOLETE OVERLOADS BY EXACT IDENTITY SIGNATURE
DROP FUNCTION IF EXISTS public.save_whatsapp_connection_credentials_rpc(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

DROP FUNCTION IF EXISTS public.disconnect_whatsapp_connection_rpc(
  UUID
);

-- 2. CANONICAL SERVICE-ROLE RPC: SAVE WHATSAPP CONNECTION CREDENTIALS
CREATE OR REPLACE FUNCTION public.save_whatsapp_connection_credentials_rpc(
  p_workspace_id UUID,
  p_waba_id TEXT,
  p_phone_number_id TEXT,
  p_access_token TEXT,
  p_meta_business_id TEXT DEFAULT NULL,
  p_display_phone TEXT DEFAULT NULL,
  p_verified_name TEXT DEFAULT NULL,
  p_quality_rating TEXT DEFAULT NULL,
  p_limit_tier TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_conn_id UUID;
BEGIN
  -- Strict Service-Role Restriction
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: credential RPC must be executed by service_role';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());

  -- Ensure Phone Number ID is not actively connected to another workspace
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_connections
    WHERE phone_number_id = trim(p_phone_number_id)
      AND workspace_id <> p_workspace_id
      AND status = 'connected'
  ) THEN
    RAISE EXCEPTION 'This Phone Number ID is already connected to another Noverlyn workspace';
  END IF;

  -- Store token securely in credentials table
  INSERT INTO public.whatsapp_credentials (workspace_id, access_token, updated_at)
  VALUES (p_workspace_id, trim(p_access_token), now())
  ON CONFLICT (workspace_id) DO UPDATE
  SET access_token = trim(p_access_token), updated_at = now();

  -- Upsert connection record
  INSERT INTO public.whatsapp_connections (
    workspace_id,
    provider,
    status,
    meta_business_id,
    whatsapp_business_account_id,
    phone_number_id,
    display_phone_number,
    verified_name,
    quality_rating,
    messaging_limit_tier,
    token_reference,
    connected_by,
    connected_at,
    disconnected_at,
    last_verified_at,
    last_error
  ) VALUES (
    p_workspace_id,
    'meta_cloud_api',
    'connected',
    trim(p_meta_business_id),
    trim(p_waba_id),
    trim(p_phone_number_id),
    trim(p_display_phone),
    trim(p_verified_name),
    COALESCE(p_quality_rating, 'UNKNOWN'),
    COALESCE(p_limit_tier, 'TIER_50'),
    'vault_secret_' || p_workspace_id::text,
    v_user_id,
    now(),
    NULL,
    now(),
    NULL
  )
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    status = 'connected',
    meta_business_id = trim(p_meta_business_id),
    whatsapp_business_account_id = trim(p_waba_id),
    phone_number_id = trim(p_phone_number_id),
    display_phone_number = trim(p_display_phone),
    verified_name = trim(p_verified_name),
    quality_rating = COALESCE(p_quality_rating, whatsapp_connections.quality_rating),
    messaging_limit_tier = COALESCE(p_limit_tier, whatsapp_connections.messaging_limit_tier),
    connected_by = COALESCE(v_user_id, whatsapp_connections.connected_by),
    connected_at = COALESCE(whatsapp_connections.connected_at, now()),
    disconnected_at = NULL,
    last_verified_at = now(),
    last_error = NULL,
    updated_at = now()
  RETURNING id INTO v_conn_id;

  -- Audit event
  INSERT INTO public.whatsapp_connection_events (
    workspace_id,
    connection_id,
    event_type,
    message,
    actor_id,
    metadata
  ) VALUES (
    p_workspace_id,
    v_conn_id,
    'connection_completed',
    'Successfully verified and connected WhatsApp Cloud API for ' || COALESCE(p_display_phone, p_phone_number_id),
    v_user_id,
    jsonb_build_object('phone_number_id', p_phone_number_id, 'waba_id', p_waba_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'connection_id', v_conn_id,
    'status', 'connected'
  );
END;
$$;

-- 3. CANONICAL SERVICE-ROLE RPC: DISCONNECT WHATSAPP CONNECTION
CREATE OR REPLACE FUNCTION public.disconnect_whatsapp_connection_rpc(
  p_workspace_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_conn RECORD;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: disconnect RPC must be executed by service_role';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());

  SELECT id INTO v_conn
  FROM public.whatsapp_connections
  WHERE workspace_id = p_workspace_id;

  IF v_conn.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active WhatsApp connection found');
  END IF;

  UPDATE public.whatsapp_connections
  SET status = 'disconnected', disconnected_at = now(), updated_at = now()
  WHERE workspace_id = p_workspace_id;

  DELETE FROM public.whatsapp_credentials WHERE workspace_id = p_workspace_id;

  INSERT INTO public.whatsapp_connection_events (
    workspace_id, connection_id, event_type, message, actor_id, metadata
  ) VALUES (
    p_workspace_id, v_conn.id, 'connection_disconnected', 'WhatsApp Cloud API connection disconnected', v_user_id, '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'status', 'disconnected');
END;
$$;

-- 4. EXPLICIT UNAMBIGUOUS REVOKE AND GRANT STATEMENTS WITH EXACT SIGNATURES
REVOKE ALL ON FUNCTION public.save_whatsapp_connection_credentials_rpc(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_whatsapp_connection_credentials_rpc(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.disconnect_whatsapp_connection_rpc(
  UUID, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.disconnect_whatsapp_connection_rpc(
  UUID, UUID
) TO service_role;
