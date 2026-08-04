-- ============================================================================
-- PHASE 10C — AI FOLLOW-UP & LOST-REVENUE RECOVERY ENGINE
-- Migration: 20260805000027_phase10c_revenue_recovery_engine.sql
-- Tables: revenue_recovery_items, follow_up_sequences, follow_up_sequence_steps,
--         revenue_recovery_scan_locks, revenue_recovery_scan_state
-- RPCs: complete_recovery_item_rpc, snooze_recovery_item_rpc, dismiss_recovery_item_rpc,
--       assign_recovery_item_rpc, start_follow_up_sequence_rpc, stop_follow_up_sequence_rpc,
--       acquire_revenue_recovery_scan_lock_rpc, release_revenue_recovery_scan_lock_rpc,
--       get_next_revenue_recovery_batch_rpc, update_revenue_recovery_cursor_rpc
-- ============================================================================

-- 1. CREATE TABLE PUBLIC.REVENUE_RECOVERY_ITEMS
CREATE TABLE IF NOT EXISTS public.revenue_recovery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  assigned_to UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  risk_type TEXT NOT NULL CHECK (risk_type IN (
    'unanswered_customer_message', 'customer_waiting_for_reply', 'overdue_follow_up',
    'no_next_action', 'quote_or_proposal_no_response', 'strong_buying_signal_no_action',
    'unresolved_objection', 'agent_promise_not_completed', 'high_intent_lead_inactive',
    'pipeline_stage_stagnation', 'conversation_resolved_without_next_step',
    'unassigned_high_value_lead', 'repeated_customer_follow_up', 'missed_appointment_or_call',
    'lead_inactivity_risk'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'snoozed', 'completed', 'dismissed', 'superseded')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('critical', 'high', 'normal', 'low')),
  confidence NUMERIC NOT NULL DEFAULT 0.8 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  recommended_at TIMESTAMPTZ NULL,
  suggested_message TEXT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_value NUMERIC NULL,
  currency TEXT NULL DEFAULT 'USD',
  source_fingerprint TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  completed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ NULL,
  dismissed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicate recovery items
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_recovery_unique_fp
  ON public.revenue_recovery_items(workspace_id, source_fingerprint);

CREATE INDEX IF NOT EXISTS idx_revenue_recovery_status
  ON public.revenue_recovery_items(workspace_id, status, urgency);

CREATE INDEX IF NOT EXISTS idx_revenue_recovery_lead
  ON public.revenue_recovery_items(lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_recovery_conv
  ON public.revenue_recovery_items(conversation_id) WHERE conversation_id IS NOT NULL;

-- 2. CREATE TABLE PUBLIC.FOLLOW_UP_SEQUENCES
CREATE TABLE IF NOT EXISTS public.follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  trigger_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  reply_mode TEXT NOT NULL DEFAULT 'suggest_only' CHECK (reply_mode IN ('suggest_only', 'approval_required', 'controlled_auto_send')),
  maximum_steps INTEGER NOT NULL DEFAULT 3,
  stop_on_customer_reply BOOLEAN NOT NULL DEFAULT true,
  stop_on_manual_takeover BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_seq_ws ON public.follow_up_sequences(workspace_id);

-- 3. CREATE TABLE PUBLIC.FOLLOW_UP_SEQUENCE_STEPS
CREATE TABLE IF NOT EXISTS public.follow_up_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 60,
  message_goal TEXT NOT NULL,
  message_template TEXT NULL,
  use_ai_personalization BOOLEAN NOT NULL DEFAULT true,
  action_type TEXT NOT NULL DEFAULT 'whatsapp_message' CHECK (action_type IN ('whatsapp_message', 'call_reminder', 'email_reminder', 'task', 'manager_escalation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_seq_steps ON public.follow_up_sequence_steps(sequence_id, step_order ASC);

-- 4. CREATE DATABASE LOCK TABLE FOR SCHEDULED RUNS
CREATE TABLE IF NOT EXISTS public.revenue_recovery_scan_locks (
  lock_key TEXT PRIMARY KEY,
  run_id UUID NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  locked_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CREATE PERSISTENT SCAN CURSOR TABLE FOR WORKSPACE BATCHING
CREATE TABLE IF NOT EXISTS public.revenue_recovery_scan_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  last_workspace_id UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.revenue_recovery_scan_state (id, last_workspace_id)
VALUES (true, NULL)
ON CONFLICT (id) DO NOTHING;

-- 6. ROW LEVEL SECURITY POLICIES
ALTER TABLE public.revenue_recovery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_recovery_scan_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_recovery_scan_state ENABLE ROW LEVEL SECURITY;

-- RLS: revenue_recovery_items
DROP POLICY IF EXISTS "Workspace members can view recovery items" ON public.revenue_recovery_items;
CREATE POLICY "Workspace members can view recovery items"
  ON public.revenue_recovery_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = revenue_recovery_items.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Workspace members can update recovery items" ON public.revenue_recovery_items;
CREATE POLICY "Workspace members can update recovery items"
  ON public.revenue_recovery_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = revenue_recovery_items.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- RLS: follow_up_sequences
DROP POLICY IF EXISTS "Workspace members can view follow up sequences" ON public.follow_up_sequences;
CREATE POLICY "Workspace members can view follow up sequences"
  ON public.follow_up_sequences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = follow_up_sequences.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage follow up sequences" ON public.follow_up_sequences;
CREATE POLICY "Owners and managers can manage follow up sequences"
  ON public.follow_up_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = follow_up_sequences.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
        AND wm.status = 'active'
    )
  );

-- RLS: follow_up_sequence_steps
DROP POLICY IF EXISTS "Workspace members can view sequence steps" ON public.follow_up_sequence_steps;
CREATE POLICY "Workspace members can view sequence steps"
  ON public.follow_up_sequence_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.follow_up_sequences seq
      JOIN public.workspace_members wm ON wm.workspace_id = seq.workspace_id
      WHERE seq.id = follow_up_sequence_steps.sequence_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

-- 7. SECURE RECOVERY ENGINE RPCs (USER & AGENT ACTIONS)

CREATE OR REPLACE FUNCTION public.complete_recovery_item_rpc(
  p_item_id UUID,
  p_outcome TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_item FROM public.revenue_recovery_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Recovery item not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_item.workspace_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.revenue_recovery_items
  SET
    status = 'completed',
    completed_at = now(),
    completed_by = v_user_id,
    outcome = COALESCE(p_outcome, 'Resolved by user action'),
    updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'id', p_item_id, 'status', 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION public.snooze_recovery_item_rpc(
  p_item_id UUID,
  p_snooze_until TIMESTAMPTZ DEFAULT (now() + interval '1 day')
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_item FROM public.revenue_recovery_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Recovery item not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_item.workspace_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.revenue_recovery_items
  SET
    status = 'snoozed',
    snoozed_until = COALESCE(p_snooze_until, now() + interval '1 day'),
    updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'id', p_item_id, 'status', 'snoozed');
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_recovery_item_rpc(
  p_item_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_item FROM public.revenue_recovery_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Recovery item not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_item.workspace_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.revenue_recovery_items
  SET
    status = 'dismissed',
    dismissed_at = now(),
    dismissed_by = v_user_id,
    outcome = COALESCE(p_reason, 'Dismissed by user'),
    updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'id', p_item_id, 'status', 'dismissed');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_recovery_item_rpc(
  p_item_id UUID,
  p_assigned_to UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_item FROM public.revenue_recovery_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Recovery item not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_item.workspace_id AND user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_item.workspace_id AND user_id = p_assigned_to AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Assigned user is not an active member of this workspace';
  END IF;

  UPDATE public.revenue_recovery_items
  SET
    assigned_to = p_assigned_to,
    updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'id', p_item_id, 'assigned_to', p_assigned_to);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_follow_up_sequence_rpc(
  p_workspace_id UUID,
  p_sequence_id UUID,
  p_lead_id UUID DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_seq RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_seq FROM public.follow_up_sequences WHERE id = p_sequence_id AND workspace_id = p_workspace_id;
  IF v_seq.id IS NULL THEN RAISE EXCEPTION 'Sequence not found'; END IF;

  RETURN jsonb_build_object('success', true, 'sequence_id', p_sequence_id, 'status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_follow_up_sequence_rpc(
  p_workspace_id UUID,
  p_sequence_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN jsonb_build_object('success', true, 'sequence_id', p_sequence_id, 'status', 'stopped');
END;
$$;

-- 8. SERVICE-ROLE ONLY LOCK & CURSOR RPCS FOR SCHEDULED EDGE FUNCTION RUNS

CREATE OR REPLACE FUNCTION public.acquire_revenue_recovery_scan_lock_rpc(
  p_lock_key TEXT,
  p_run_id UUID,
  p_ttl_seconds INTEGER DEFAULT 600
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + (p_ttl_seconds || ' seconds')::interval;
BEGIN
  -- Clean up expired locks first
  DELETE FROM public.revenue_recovery_scan_locks
  WHERE lock_key = p_lock_key AND expires_at < v_now;

  -- Attempt atomic insert or replace expired lock
  INSERT INTO public.revenue_recovery_scan_locks (
    lock_key, run_id, locked_at, expires_at, locked_by, updated_at
  ) VALUES (
    p_lock_key, p_run_id, v_now, v_expires_at, 'cron_runner', v_now
  )
  ON CONFLICT (lock_key) DO UPDATE
  SET
    run_id = EXCLUDED.run_id,
    locked_at = EXCLUDED.locked_at,
    expires_at = EXCLUDED.expires_at,
    locked_by = EXCLUDED.locked_by,
    updated_at = EXCLUDED.updated_at
  WHERE public.revenue_recovery_scan_locks.expires_at < v_now;

  -- Return true if lock is currently held by this run_id
  RETURN EXISTS (
    SELECT 1 FROM public.revenue_recovery_scan_locks
    WHERE lock_key = p_lock_key AND run_id = p_run_id AND expires_at >= v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_revenue_recovery_scan_lock_rpc(
  p_lock_key TEXT,
  p_run_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.revenue_recovery_scan_locks
  WHERE lock_key = p_lock_key AND run_id = p_run_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_revenue_recovery_batch_rpc(
  p_batch_size INTEGER DEFAULT 25
)
RETURNS TABLE (workspace_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_id UUID;
  v_count INT;
BEGIN
  SELECT last_workspace_id INTO v_last_id
  FROM public.revenue_recovery_scan_state
  WHERE id = true;

  -- Return next batch after cursor
  RETURN QUERY
  SELECT w.id
  FROM public.workspaces w
  WHERE (v_last_id IS NULL OR w.id > v_last_id)
  ORDER BY w.id ASC
  LIMIT p_batch_size;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- If no rows remain after cursor, reset cursor to NULL and fetch from start
  IF v_count = 0 THEN
    UPDATE public.revenue_recovery_scan_state
    SET last_workspace_id = NULL, updated_at = now()
    WHERE id = true;

    RETURN QUERY
    SELECT w.id
    FROM public.workspaces w
    ORDER BY w.id ASC
    LIMIT p_batch_size;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_revenue_recovery_cursor_rpc(
  p_last_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.revenue_recovery_scan_state
  SET last_workspace_id = p_last_workspace_id, updated_at = now()
  WHERE id = true;
END;
$$;

-- 9. REVOKE AND GRANT PERMISSIONS (STRICT SECURITY ROLES)

REVOKE ALL ON FUNCTION public.complete_recovery_item_rpc(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_recovery_item_rpc(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.snooze_recovery_item_rpc(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snooze_recovery_item_rpc(UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.dismiss_recovery_item_rpc(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_recovery_item_rpc(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_recovery_item_rpc(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_recovery_item_rpc(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.start_follow_up_sequence_rpc(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_follow_up_sequence_rpc(UUID, UUID, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.stop_follow_up_sequence_rpc(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stop_follow_up_sequence_rpc(UUID, UUID, TEXT) TO authenticated;

-- Service role only RPC grants
REVOKE ALL ON FUNCTION public.acquire_revenue_recovery_scan_lock_rpc(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_revenue_recovery_scan_lock_rpc(TEXT, UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.release_revenue_recovery_scan_lock_rpc(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_revenue_recovery_scan_lock_rpc(TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_next_revenue_recovery_batch_rpc(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_revenue_recovery_batch_rpc(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.update_revenue_recovery_cursor_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_revenue_recovery_cursor_rpc(UUID) TO service_role;
