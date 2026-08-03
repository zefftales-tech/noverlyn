-- ============================================================================
-- PHASE 9B.1 — OFFICIAL WHATSAPP CLOUD API CONNECTION FOUNDATION
-- Migration: 20260802000018_phase9b1_whatsapp_cloud_connection.sql
-- ============================================================================

-- 1. CREATE TABLE PUBLIC.WHATSAPP_CONNECTIONS
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_cloud_api',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'action_required', 'error')),
  meta_business_id TEXT NULL,
  whatsapp_business_account_id TEXT NULL,
  phone_number_id TEXT NULL,
  display_phone_number TEXT NULL,
  verified_name TEXT NULL,
  quality_rating TEXT NULL,
  messaging_limit_tier TEXT NULL,
  token_reference TEXT NULL,
  token_expires_at TIMESTAMPTZ NULL,
  connected_by UUID NULL REFERENCES auth.users(id),
  connected_at TIMESTAMPTZ NULL,
  disconnected_at TIMESTAMPTZ NULL,
  last_verified_at TIMESTAMPTZ NULL,
  last_webhook_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_workspace ON public.whatsapp_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_phone_id ON public.whatsapp_connections(phone_number_id) WHERE phone_number_id IS NOT NULL;

-- 2. CREATE SECURE CREDENTIALS TABLE (NO SELECT PERMISSION FOR NORMAL USERS)
CREATE TABLE IF NOT EXISTS public.whatsapp_credentials (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. CREATE TABLE PUBLIC.WHATSAPP_WEBHOOK_EVENTS
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  provider_event_id TEXT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  processing_error TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_conn ON public.whatsapp_webhook_events(connection_id, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_idempotency ON public.whatsapp_webhook_events(connection_id, provider_event_id) WHERE provider_event_id IS NOT NULL;

-- 4. CREATE TABLE PUBLIC.WHATSAPP_CONNECTION_EVENTS
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NULL,
  actor_id UUID NULL REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_events_ws ON public.whatsapp_connection_events(workspace_id, created_at DESC);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connection_events ENABLE ROW LEVEL SECURITY;

-- RLS: whatsapp_connections
DROP POLICY IF EXISTS "Workspace members can view whatsapp connection" ON public.whatsapp_connections;
CREATE POLICY "Workspace members can view whatsapp connection"
  ON public.whatsapp_connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_connections.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage whatsapp connection" ON public.whatsapp_connections;
CREATE POLICY "Owners and managers can manage whatsapp connection"
  ON public.whatsapp_connections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_connections.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

-- RLS: whatsapp_credentials (NO PUBLIC READ/WRITE POLICIES — RESTRICTED TO SERVICE ROLE / SECURITY DEFINER)

-- RLS: whatsapp_webhook_events
DROP POLICY IF EXISTS "Owners and managers can view webhook events" ON public.whatsapp_webhook_events;
CREATE POLICY "Owners and managers can view webhook events"
  ON public.whatsapp_webhook_events FOR SELECT
  USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_webhook_events.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

-- RLS: whatsapp_connection_events
DROP POLICY IF EXISTS "Workspace members can view connection audit log" ON public.whatsapp_connection_events;
CREATE POLICY "Workspace members can view connection audit log"
  ON public.whatsapp_connection_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_connection_events.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- 6. SECURITY DEFINER RPC FUNCTIONS

-- Save Connection & Credentials RPC (Owner Only)
CREATE OR REPLACE FUNCTION public.save_whatsapp_connection_credentials_rpc(
  p_workspace_id UUID,
  p_waba_id TEXT,
  p_phone_number_id TEXT,
  p_access_token TEXT,
  p_meta_business_id TEXT DEFAULT NULL,
  p_display_phone TEXT DEFAULT NULL,
  p_verified_name TEXT DEFAULT NULL,
  p_quality_rating TEXT DEFAULT NULL,
  p_limit_tier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_conn_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can connect WhatsApp Cloud API credentials';
  END IF;

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
    connected_by = v_user_id,
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

-- Disconnect Connection RPC (Owner Only)
CREATE OR REPLACE FUNCTION public.disconnect_whatsapp_connection_rpc(
  p_workspace_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_conn RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only workspace owners can disconnect WhatsApp Cloud API';
  END IF;

  SELECT id INTO v_conn
  FROM public.whatsapp_connections
  WHERE workspace_id = p_workspace_id;

  -- Remove access token
  DELETE FROM public.whatsapp_credentials WHERE workspace_id = p_workspace_id;

  -- Update connection status
  UPDATE public.whatsapp_connections
  SET
    status = 'disconnected',
    disconnected_at = now(),
    updated_at = now()
  WHERE workspace_id = p_workspace_id;

  -- Audit event
  INSERT INTO public.whatsapp_connection_events (
    workspace_id,
    connection_id,
    event_type,
    message,
    actor_id
  ) VALUES (
    p_workspace_id,
    v_conn.id,
    'disconnected',
    'Disconnected WhatsApp Cloud API integration',
    v_user_id
  );

  RETURN jsonb_build_object('success', true, 'status', 'disconnected');
END;
$$;

-- Internal helper to fetch credentials for server-side Edge Functions
CREATE OR REPLACE FUNCTION public.get_whatsapp_connection_credentials_internal(
  p_workspace_id UUID
)
RETURNS TABLE (
  phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  access_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.phone_number_id,
    c.whatsapp_business_account_id,
    cred.access_token
  FROM public.whatsapp_connections c
  JOIN public.whatsapp_credentials cred ON cred.workspace_id = c.workspace_id
  WHERE c.workspace_id = p_workspace_id
    AND c.status = 'connected';
END;
$$;

-- Grant EXECUTE privileges to authenticated users for RPCs
GRANT EXECUTE ON FUNCTION public.save_whatsapp_connection_credentials_rpc(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_whatsapp_connection_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connection_credentials_internal(UUID) TO service_role;
