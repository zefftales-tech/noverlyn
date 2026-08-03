-- ============================================================================
-- PHASE 9B.2 — REAL-TIME WHATSAPP INBOX, LEAD MATCHING & CLOUD REPLIES
-- Migration: 20260804000019_phase9b2_realtime_whatsapp_inbox.sql
-- Strictly hardened RLS, status state transition rules, notification dedupe index,
-- row locking & rerun safety
-- ============================================================================

-- 1. CREATE TABLE PUBLIC.WHATSAPP_CONVERSATIONS
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved', 'blocked')),
  assigned_to UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NULL,
  last_incoming_at TIMESTAMPTZ NULL,
  last_outgoing_at TIMESTAMPTZ NULL,
  last_message_preview TEXT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  needs_response BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_whatsapp_conversations_active UNIQUE (workspace_id, connection_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_ws ON public.whatsapp_conversations(workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_conn ON public.whatsapp_conversations(connection_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_lead ON public.whatsapp_conversations(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned ON public.whatsapp_conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status ON public.whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_response ON public.whatsapp_conversations(needs_response) WHERE needs_response IS TRUE;

-- 2. CREATE TABLE PUBLIC.WHATSAPP_MESSAGES
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  meta_message_id TEXT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contacts', 'interactive', 'unsupported')),
  text_body TEXT NULL,
  media_id TEXT NULL,
  media_mime_type TEXT NULL,
  media_filename TEXT NULL,
  media_caption TEXT NULL,
  reply_to_meta_message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'accepted', 'sent', 'delivered', 'read', 'failed')),
  error_code TEXT NULL,
  error_message TEXT NULL,
  sent_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ NULL,
  read_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv ON public.whatsapp_messages(conversation_id, occurred_at ASC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead ON public.whatsapp_messages(lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_meta_id ON public.whatsapp_messages(meta_message_id) WHERE meta_message_id IS NOT NULL;

-- 3. CREATE TABLE PUBLIC.WHATSAPP_CONTACT_REVIEWS
CREATE TABLE IF NOT EXISTS public.whatsapp_contact_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'linked', 'rejected', 'spam')),
  possible_duplicate_lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  approved_lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contact_reviews_ws ON public.whatsapp_contact_reviews(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_contact_reviews_pending ON public.whatsapp_contact_reviews(conversation_id) WHERE status = 'pending';

-- 4. ENSURE NOTIFICATIONS UNIQUE PARTIAL INDEX FOR DEDUPLICATION
CREATE UNIQUE INDEX IF NOT EXISTS uk_notifications_dedupe
ON public.notifications (user_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;

-- 5. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contact_reviews ENABLE ROW LEVEL SECURITY;

-- RLS: whatsapp_conversations
DROP POLICY IF EXISTS "Owners and managers can view all workspace conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Agents can view assigned or authorized lead conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Workspace members can view whatsapp conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Workspace members can update whatsapp conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Owners and managers can update all workspace conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Agents can update assigned workspace conversations" ON public.whatsapp_conversations;

CREATE POLICY "Owners and managers can view all workspace conversations"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_conversations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

CREATE POLICY "Agents can view assigned or authorized lead conversations"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_conversations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'agent'
        AND wm.status = 'active'
    )
    AND (
      whatsapp_conversations.assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = whatsapp_conversations.lead_id
          AND l.workspace_id = whatsapp_conversations.workspace_id
          AND l.deleted_at IS NULL
          AND l.archived_at IS NULL
          AND (l.assigned_to = auth.uid() OR l.assigned_to IS NULL)
      )
    )
  );

CREATE POLICY "Owners and managers can update all workspace conversations"
  ON public.whatsapp_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_conversations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

CREATE POLICY "Agents can update assigned workspace conversations"
  ON public.whatsapp_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_conversations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'agent'
        AND wm.status = 'active'
    )
    AND whatsapp_conversations.assigned_to = auth.uid()
  );

-- RLS: whatsapp_messages (Remove direct authenticated INSERT; only SELECT allowed according to conversation access)
DROP POLICY IF EXISTS "Workspace members can view whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Workspace members can insert whatsapp messages" ON public.whatsapp_messages;

CREATE POLICY "Workspace members can view whatsapp messages"
  ON public.whatsapp_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations wc
      WHERE wc.id = whatsapp_messages.conversation_id
    )
  );

-- RLS: whatsapp_contact_reviews (Owner and Manager ONLY)
DROP POLICY IF EXISTS "Workspace members can view contact reviews" ON public.whatsapp_contact_reviews;
DROP POLICY IF EXISTS "Owners and managers can manage contact reviews" ON public.whatsapp_contact_reviews;

CREATE POLICY "Owners and managers can manage contact reviews"
  ON public.whatsapp_contact_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_contact_reviews.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

-- 6. PHONE NORMALIZATION & MONOTONIC STATUS RANK HELPERS (SQL)
CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  RETURN regexp_replace(p_phone, '\D', '', 'g');
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_status_rank(p_status TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'queued' THEN 0
    WHEN 'accepted' THEN 1
    WHEN 'sent' THEN 2
    WHEN 'delivered' THEN 3
    WHEN 'read' THEN 4
    ELSE -1
  END;
$$;

-- 7. SECURITY DEFINER RPCs

-- Inbound Message Processing RPC (Invoked by Webhook Edge Function via Service Role)
CREATE OR REPLACE FUNCTION public.process_inbound_whatsapp_message_rpc(
  p_workspace_id UUID,
  p_connection_id UUID,
  p_sender_phone TEXT,
  p_sender_name TEXT,
  p_meta_message_id TEXT,
  p_message_type TEXT,
  p_text_body TEXT,
  p_media_id TEXT DEFAULT NULL,
  p_media_mime TEXT DEFAULT NULL,
  p_media_filename TEXT DEFAULT NULL,
  p_media_caption TEXT DEFAULT NULL,
  p_timestamp TIMESTAMPTZ DEFAULT now(),
  p_raw_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_phone TEXT;
  v_conv_id UUID;
  v_lead_id UUID;
  v_msg_id UUID;
  v_match_count INT;
  v_assigned_agent UUID;
  v_preview TEXT;
BEGIN
  -- Normalize sender phone
  v_clean_phone := public.normalize_phone_digits(p_sender_phone);
  IF v_clean_phone IS NULL OR v_clean_phone = '' THEN
    RAISE EXCEPTION 'Invalid sender phone';
  END IF;

  -- Preview text calculation
  v_preview := COALESCE(p_text_body, p_media_caption, '[' || upper(p_message_type) || ']');
  v_preview := substring(v_preview from 1 for 150);

  -- 1. Deduplicate message
  IF p_meta_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.whatsapp_messages WHERE meta_message_id = p_meta_message_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'meta_message_id', p_meta_message_id);
  END IF;

  -- 2. Lead matching using normalized phone (deleted_at IS NULL AND archived_at IS NULL)
  SELECT count(*), max(id), max(assigned_to)
  INTO v_match_count, v_lead_id, v_assigned_agent
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND archived_at IS NULL
    AND public.normalize_phone_digits(phone) = v_clean_phone;

  IF v_match_count > 1 THEN
    v_lead_id := NULL; -- Ambiguous multiple matches
  END IF;

  -- 3. Upsert Conversation
  INSERT INTO public.whatsapp_conversations (
    workspace_id,
    connection_id,
    lead_id,
    contact_phone,
    contact_name,
    status,
    assigned_to,
    last_message_at,
    last_incoming_at,
    last_message_preview,
    unread_count,
    needs_response
  ) VALUES (
    p_workspace_id,
    p_connection_id,
    v_lead_id,
    v_clean_phone,
    p_sender_name,
    'open',
    v_assigned_agent,
    p_timestamp,
    p_timestamp,
    v_preview,
    1,
    true
  )
  ON CONFLICT (workspace_id, connection_id, contact_phone) DO UPDATE
  SET
    lead_id = COALESCE(public.whatsapp_conversations.lead_id, v_lead_id),
    contact_name = COALESCE(EXCLUDED.contact_name, public.whatsapp_conversations.contact_name),
    status = 'open',
    assigned_to = COALESCE(public.whatsapp_conversations.assigned_to, v_assigned_agent),
    last_message_at = EXCLUDED.last_message_at,
    last_incoming_at = EXCLUDED.last_incoming_at,
    last_message_preview = EXCLUDED.last_message_preview,
    unread_count = public.whatsapp_conversations.unread_count + 1,
    needs_response = true,
    updated_at = now()
  RETURNING id INTO v_conv_id;

  -- 4. Insert Message
  INSERT INTO public.whatsapp_messages (
    workspace_id,
    connection_id,
    conversation_id,
    lead_id,
    meta_message_id,
    direction,
    message_type,
    text_body,
    media_id,
    media_mime_type,
    media_filename,
    media_caption,
    status,
    occurred_at,
    raw_metadata
  ) VALUES (
    p_workspace_id,
    p_connection_id,
    v_conv_id,
    v_lead_id,
    p_meta_message_id,
    'incoming',
    p_message_type,
    p_text_body,
    p_media_id,
    p_media_mime,
    p_media_filename,
    p_media_caption,
    'received',
    p_timestamp,
    p_raw_metadata
  )
  RETURNING id INTO v_msg_id;

  -- 5. Update linked Lead communication timestamps
  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET
      last_communication_at = p_timestamp,
      last_incoming_message_at = p_timestamp,
      communication_status = 'needs_response',
      updated_at = now()
    WHERE id = v_lead_id;

    -- Also record timeline communication log
    INSERT INTO public.lead_communications (
      workspace_id,
      lead_id,
      direction,
      channel,
      message,
      communication_status,
      created_at
    ) VALUES (
      p_workspace_id,
      v_lead_id,
      'incoming',
      'whatsapp',
      v_preview,
      'needs_response',
      p_timestamp
    );

    -- Create deduplicated notification for assigned agent
    IF v_assigned_agent IS NOT NULL THEN
      INSERT INTO public.notifications (
        workspace_id,
        user_id,
        lead_id,
        title,
        message,
        type,
        dedupe_key,
        link_url
      ) VALUES (
        p_workspace_id,
        v_assigned_agent,
        v_lead_id,
        'New WhatsApp Message',
        'Received message from ' || COALESCE(p_sender_name, v_clean_phone) || ': ' || v_preview,
        'whatsapp_message',
        'whatsapp_msg:' || p_meta_message_id || ':needs_response',
        '/whatsapp/inbox'
      )
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  ELSE
    -- Unmatched lead: upsert pending contact review
    INSERT INTO public.whatsapp_contact_reviews (
      workspace_id,
      connection_id,
      conversation_id,
      contact_phone,
      contact_name,
      status,
      possible_duplicate_lead_id
    ) VALUES (
      p_workspace_id,
      p_connection_id,
      v_conv_id,
      v_clean_phone,
      p_sender_name,
      'pending',
      CASE WHEN v_match_count > 1 THEN v_lead_id ELSE NULL END
    )
    ON CONFLICT (conversation_id) WHERE status = 'pending' DO UPDATE
    SET
      contact_name = COALESCE(EXCLUDED.contact_name, public.whatsapp_contact_reviews.contact_name),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conversation_id', v_conv_id,
    'message_id', v_msg_id,
    'lead_id', v_lead_id
  );
END;
$$;

-- Monotonic & Failed State Progression Status Update RPC (Invoked by Webhook Edge Function)
-- Exact Status Rules:
-- 1. Normal forward progression: queued (0) -> accepted (1) -> sent (2) -> delivered (3) -> read (4). No backward movement.
-- 2. Failed state rules:
--    - queued, accepted, or sent may transition to failed.
--    - delivered and read cannot move to failed (delivered/read status is preserved against stale failed events).
--    - failed may transition to delivered or read if a later authoritative Meta status arrives.
--    - duplicate failed events are idempotent.
--    - unknown statuses leave current status unchanged.
CREATE OR REPLACE FUNCTION public.process_whatsapp_status_update_rpc(
  p_workspace_id UUID,
  p_meta_message_id TEXT,
  p_status TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT now(),
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_meta_message_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing meta_message_id');
  END IF;

  UPDATE public.whatsapp_messages
  SET
    status = CASE
      -- Rule: read is final and cannot move backward or to failed
      WHEN whatsapp_messages.status = 'read' THEN 'read'

      -- Rule: delivered cannot move backward to sent/accepted/queued or to failed from a stale event
      WHEN whatsapp_messages.status = 'delivered' AND p_status IN ('sent', 'accepted', 'queued', 'failed') THEN 'delivered'

      -- Rule: failed can transition to delivered or read if authoritative later event arrives
      WHEN whatsapp_messages.status = 'failed' AND p_status IN ('delivered', 'read') THEN p_status

      -- Rule: failed remains failed if incoming status is sent/accepted/queued/failed or unknown
      WHEN whatsapp_messages.status = 'failed' THEN 'failed'

      -- Rule: queued/accepted/sent can transition to failed
      WHEN p_status = 'failed' THEN 'failed'

      -- Rule: Normal forward progression (only allow transition if new rank is strictly greater than current rank)
      WHEN public.whatsapp_status_rank(p_status) > public.whatsapp_status_rank(whatsapp_messages.status) THEN p_status

      -- Default: preserve current status for unknown or out-of-order statuses
      ELSE whatsapp_messages.status
    END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN COALESCE(delivered_at, p_timestamp) ELSE delivered_at END,
    read_at = CASE WHEN p_status = 'read' THEN COALESCE(read_at, p_timestamp) ELSE read_at END,
    failed_at = CASE
      WHEN p_status = 'failed' AND whatsapp_messages.status IN ('queued', 'accepted', 'sent') THEN COALESCE(failed_at, p_timestamp)
      ELSE failed_at
    END,
    error_code = CASE
      WHEN p_status = 'failed' AND whatsapp_messages.status IN ('queued', 'accepted', 'sent', 'failed') THEN COALESCE(p_error_code, error_code)
      ELSE error_code
    END,
    error_message = CASE
      WHEN p_status = 'failed' AND whatsapp_messages.status IN ('queued', 'accepted', 'sent', 'failed') THEN COALESCE(p_error_message, error_message)
      ELSE error_message
    END
  WHERE meta_message_id = p_meta_message_id;

  RETURN jsonb_build_object('success', true, 'meta_message_id', p_meta_message_id, 'status', p_status);
END;
$$;

-- Secure Assign Conversation RPC
CREATE OR REPLACE FUNCTION public.assign_whatsapp_conversation_rpc(
  p_conversation_id UUID,
  p_assigned_to UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_ws_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT workspace_id INTO v_ws_id FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF v_ws_id IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  SELECT role INTO v_role FROM public.workspace_members
  WHERE workspace_id = v_ws_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can assign conversations';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE workspace_id = v_ws_id AND user_id = p_assigned_to AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Assigned agent must be an active workspace member';
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    assigned_to = p_assigned_to,
    updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true, 'conversation_id', p_conversation_id, 'assigned_to', p_assigned_to);
END;
$$;

-- Secure Update Conversation Status RPC
CREATE OR REPLACE FUNCTION public.update_whatsapp_conversation_status_rpc(
  p_conversation_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_conv RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_status NOT IN ('open', 'waiting', 'resolved', 'blocked') THEN
    RAISE EXCEPTION 'Invalid conversation status: %', p_status;
  END IF;

  SELECT * INTO v_conv FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  SELECT role INTO v_role FROM public.workspace_members
  WHERE workspace_id = v_conv.workspace_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Agent status update restriction: must be assigned_to or authorized lead
  IF v_role = 'agent' AND v_conv.assigned_to != v_user_id THEN
    IF v_conv.lead_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = v_conv.lead_id AND l.workspace_id = v_conv.workspace_id AND (l.assigned_to = v_user_id OR l.assigned_to IS NULL)
    ) THEN
      RAISE EXCEPTION 'Agents can only update assigned or accessible conversations';
    END IF;
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    status = p_status,
    needs_response = CASE WHEN p_status = 'resolved' THEN false WHEN p_status = 'open' THEN true ELSE needs_response END,
    resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE resolved_at END,
    resolved_by = CASE WHEN p_status = 'resolved' THEN v_user_id ELSE resolved_by END,
    updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true, 'conversation_id', p_conversation_id, 'status', p_status);
END;
$$;

-- Secure Mark Conversation Read RPC
CREATE OR REPLACE FUNCTION public.mark_whatsapp_conversation_read_rpc(
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_ws_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT workspace_id INTO v_ws_id
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF v_ws_id IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_ws_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    unread_count = 0,
    updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true, 'conversation_id', p_conversation_id);
END;
$$;

-- Create Lead from WhatsApp Contact Review RPC (Row Locking)
CREATE OR REPLACE FUNCTION public.create_lead_from_whatsapp_review_rpc(
  p_review_id UUID,
  p_lead_name TEXT,
  p_assigned_to UUID DEFAULT NULL,
  p_stage TEXT DEFAULT 'New',
  p_priority TEXT DEFAULT 'Medium',
  p_initial_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_review RECORD;
  v_lead_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Lock row FOR UPDATE to prevent double processing
  SELECT * INTO v_review
  FROM public.whatsapp_contact_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF v_review.id IS NULL THEN RAISE EXCEPTION 'Contact review not found'; END IF;

  IF v_review.status != 'pending' THEN
    RAISE EXCEPTION 'Contact review is no longer pending (current status: %)', v_review.status;
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_review.workspace_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can approve contact reviews';
  END IF;

  -- Create new Lead
  INSERT INTO public.leads (
    workspace_id,
    name,
    phone,
    status,
    priority,
    assigned_to,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_review.workspace_id,
    trim(p_lead_name),
    v_review.contact_phone,
    p_stage,
    p_priority,
    COALESCE(p_assigned_to, v_user_id),
    v_user_id,
    now(),
    now()
  )
  RETURNING id INTO v_lead_id;

  -- Update review record
  UPDATE public.whatsapp_contact_reviews
  SET
    status = 'approved',
    reviewed_by = v_user_id,
    reviewed_at = now(),
    approved_lead_id = v_lead_id,
    updated_at = now()
  WHERE id = p_review_id;

  -- Link conversation and messages to new lead
  UPDATE public.whatsapp_conversations
  SET
    lead_id = v_lead_id,
    assigned_to = COALESCE(p_assigned_to, v_user_id),
    updated_at = now()
  WHERE id = v_review.conversation_id;

  UPDATE public.whatsapp_messages
  SET lead_id = v_lead_id
  WHERE conversation_id = v_review.conversation_id;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'conversation_id', v_review.conversation_id
  );
END;
$$;

-- Link WhatsApp Conversation to Existing Lead RPC (Row Locking)
CREATE OR REPLACE FUNCTION public.link_whatsapp_conversation_to_lead_rpc(
  p_review_id UUID,
  p_lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_review RECORD;
  v_lead RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Lock row FOR UPDATE to prevent double processing
  SELECT * INTO v_review
  FROM public.whatsapp_contact_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF v_review.id IS NULL THEN RAISE EXCEPTION 'Review not found'; END IF;

  IF v_review.status != 'pending' THEN
    RAISE EXCEPTION 'Contact review is no longer pending (current status: %)', v_review.status;
  END IF;

  SELECT role INTO v_role FROM public.workspace_members
  WHERE workspace_id = v_review.workspace_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_lead FROM public.leads
  WHERE id = p_lead_id
    AND workspace_id = v_review.workspace_id
    AND deleted_at IS NULL
    AND archived_at IS NULL;

  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found or is deleted/archived'; END IF;

  UPDATE public.whatsapp_contact_reviews
  SET
    status = 'linked',
    reviewed_by = v_user_id,
    reviewed_at = now(),
    approved_lead_id = p_lead_id,
    updated_at = now()
  WHERE id = p_review_id;

  UPDATE public.whatsapp_conversations
  SET
    lead_id = p_lead_id,
    updated_at = now()
  WHERE id = v_review.conversation_id;

  UPDATE public.whatsapp_messages
  SET lead_id = p_lead_id
  WHERE conversation_id = v_review.conversation_id;

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'conversation_id', v_review.conversation_id);
END;
$$;

-- 8. GUARDED RERUN-SAFE SUPABASE REALTIME PUBLICATION ADDITIONS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_contact_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contact_reviews;
  END IF;
END $$;

-- 9. EXPLICIT REVOKE DEFAULT PUBLIC ACCESS & GRANT AUTHORIZED PRIVILEGES
REVOKE ALL ON FUNCTION public.process_inbound_whatsapp_message_rpc(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_whatsapp_status_update_rpc(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_whatsapp_conversation_rpc(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_whatsapp_conversation_status_rpc(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_whatsapp_conversation_read_rpc(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_lead_from_whatsapp_review_rpc(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_whatsapp_conversation_to_lead_rpc(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_inbound_whatsapp_message_rpc(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_status_update_rpc(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_whatsapp_conversation_rpc(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_whatsapp_conversation_status_rpc(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_conversation_read_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lead_from_whatsapp_review_rpc(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_whatsapp_conversation_to_lead_rpc(UUID, UUID) TO authenticated;
