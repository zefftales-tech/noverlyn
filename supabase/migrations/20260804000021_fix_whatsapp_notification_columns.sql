-- ============================================================================
-- PHASE 9B.2 — CORRECTIVE MIGRATION
-- Migration: 20260804000021_fix_whatsapp_notification_columns.sql
-- Fixes notification insert error "column lead_id of relation notifications does not exist"
-- Replaces invalid notification columns with live schema columns:
-- (workspace_id, user_id, type, title, message, entity_type, entity_id, dedupe_key, metadata).
-- Wraps notification insert in a protected EXCEPTION block so notification failures
-- can NEVER block conversation, message, or review commit.
-- ============================================================================

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
  v_lead_id UUID := NULL;
  v_msg_id UUID;
  v_match_count INT := 0;
  v_assigned_agent UUID := NULL;
  v_notify_user UUID := NULL;
  v_preview TEXT;
  v_existing_conv RECORD;
BEGIN
  -- Normalize sender phone
  v_clean_phone := public.normalize_phone_digits(p_sender_phone);
  IF v_clean_phone IS NULL OR v_clean_phone = '' THEN
    RAISE EXCEPTION 'Invalid sender phone';
  END IF;

  -- Preview text calculation
  v_preview := COALESCE(p_text_body, p_media_caption, '[' || upper(p_message_type) || ']');
  v_preview := substring(v_preview from 1 for 150);

  -- 1. Deduplicate message idempotently
  IF p_meta_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.whatsapp_messages WHERE meta_message_id = p_meta_message_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'meta_message_id', p_meta_message_id);
  END IF;

  -- 2. Lead matching using normalized phone (deleted_at IS NULL AND archived_at IS NULL)
  SELECT count(*) INTO v_match_count
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND archived_at IS NULL
    AND public.normalize_phone_digits(phone) = v_clean_phone;

  -- Match uniquely when count is exactly 1
  IF v_match_count = 1 THEN
    SELECT id, assigned_to
    INTO v_lead_id, v_assigned_agent
    FROM public.leads
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND archived_at IS NULL
      AND public.normalize_phone_digits(phone) = v_clean_phone
    ORDER BY created_at ASC, id::text ASC
    LIMIT 1;
  ELSE
    v_lead_id := NULL;
    v_assigned_agent := NULL;
  END IF;

  -- Fetch existing conversation if present
  SELECT * INTO v_existing_conv
  FROM public.whatsapp_conversations
  WHERE workspace_id = p_workspace_id
    AND connection_id = p_connection_id
    AND contact_phone = v_clean_phone;

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

  -- 5. Determine deterministic notification recipient
  -- Rule: 1. conversation assigned_to -> 2. lead assigned_to -> 3. workspace owner/manager fallback
  v_notify_user := COALESCE(v_existing_conv.assigned_to, v_assigned_agent);

  IF v_notify_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = v_notify_user AND status = 'active'
  ) THEN
    SELECT user_id INTO v_notify_user
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND status = 'active'
    ORDER BY
      CASE role
        WHEN 'owner' THEN 1
        WHEN 'manager' THEN 2
        ELSE 3
      END,
      created_at ASC,
      user_id::text ASC
    LIMIT 1;
  END IF;

  -- 6. Update linked Lead communication timestamps or create contact review
  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET
      last_communication_at = p_timestamp,
      last_incoming_message_at = p_timestamp,
      communication_status = 'needs_response',
      updated_at = now()
    WHERE id = v_lead_id;

    -- Record timeline communication log
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

  -- 7. Create deduplicated notification (wrapped in EXCEPTION block for safety)
  IF v_notify_user IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        workspace_id,
        user_id,
        type,
        title,
        message,
        entity_type,
        entity_id,
        dedupe_key,
        metadata
      ) VALUES (
        p_workspace_id,
        v_notify_user,
        'whatsapp_message',
        'New WhatsApp Message',
        'Received message from ' || COALESCE(p_sender_name, v_clean_phone) || ': ' || v_preview,
        'lead',
        v_lead_id,
        'whatsapp_msg:' || lower(trim(p_meta_message_id)) || ':needs_response',
        jsonb_build_object(
          'lead_id', v_lead_id,
          'conversation_id', v_conv_id,
          'meta_message_id', p_meta_message_id,
          'link_url', '/whatsapp/inbox'
        )
      )
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'WhatsApp notification insert failed: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conversation_id', v_conv_id,
    'message_id', v_msg_id,
    'lead_id', v_lead_id,
    'notified_user_id', v_notify_user
  );
END;
$$;

-- Security Grants
REVOKE ALL ON FUNCTION public.process_inbound_whatsapp_message_rpc(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_inbound_whatsapp_message_rpc(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
