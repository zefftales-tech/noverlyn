-- Noverlyn Phase 1 Database Migration: Multi-Tenant Real Estate Lead Operations OS Foundation
-- Timestamp: 20260731000000

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------------------------------
-- 1. PROFILES TABLE
-------------------------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    avatar_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-------------------------------------------------------
-- 2. WORKSPACES TABLE
-------------------------------------------------------
CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id),
    timezone TEXT NOT NULL DEFAULT 'UTC',
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index on lower(slug)
CREATE UNIQUE INDEX idx_workspaces_slug_unique ON public.workspaces(lower(slug));
CREATE INDEX idx_workspaces_owner ON public.workspaces(owner_user_id);

-------------------------------------------------------
-- 3. WORKSPACE MEMBERS TABLE
-------------------------------------------------------
CREATE TABLE public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'agent')),
    status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
    joined_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_workspace_member UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_wm_workspace_user ON public.workspace_members(workspace_id, user_id);
CREATE INDEX idx_wm_user_status ON public.workspace_members(user_id, status);

-------------------------------------------------------
-- 4. LEADS TABLE
-------------------------------------------------------
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    source TEXT NULL,
    requirement TEXT NULL,
    budget_min NUMERIC NULL,
    budget_max NUMERIC NULL,
    estimated_value NUMERIC NULL,
    assigned_to UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    stage TEXT NOT NULL CHECK (stage IN ('new', 'contacted', 'qualified', 'property_shared', 'viewing_scheduled', 'negotiation', 'won', 'lost')),
    priority TEXT NOT NULL CHECK (priority IN ('hot', 'warm', 'cold')),
    status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost', 'archived')),
    next_follow_up_at TIMESTAMPTZ NULL,
    last_activity_at TIMESTAMPTZ NULL,
    last_contacted_at TIMESTAMPTZ NULL,
    lost_reason TEXT NULL CHECK (lost_reason IS NULL OR lost_reason IN ('price', 'no_response', 'bought_elsewhere', 'location', 'financing', 'not_ready', 'other')),
    lost_notes TEXT NULL,
    lost_at TIMESTAMPTZ NULL,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_workspace ON public.leads(workspace_id);
CREATE INDEX idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX idx_leads_stage ON public.leads(stage);
CREATE INDEX idx_leads_priority ON public.leads(priority);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_next_follow_up ON public.leads(next_follow_up_at);
CREATE INDEX idx_leads_created_at ON public.leads(created_at);

-------------------------------------------------------
-- 5. FOLLOW_UPS TABLE
-------------------------------------------------------
CREATE TABLE public.follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    assigned_to UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'due', 'overdue', 'completed', 'cancelled')),
    type TEXT NULL CHECK (type IS NULL OR type IN ('call', 'whatsapp', 'email', 'meeting', 'viewing', 'other')),
    outcome TEXT NULL,
    notes TEXT NULL,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_follow_ups_workspace ON public.follow_ups(workspace_id);
CREATE INDEX idx_follow_ups_lead ON public.follow_ups(lead_id);
CREATE INDEX idx_follow_ups_assigned ON public.follow_ups(assigned_to);
CREATE INDEX idx_follow_ups_scheduled ON public.follow_ups(scheduled_at);
CREATE INDEX idx_follow_ups_status ON public.follow_ups(status);

-------------------------------------------------------
-- 6. ACTIVITIES TABLE
-------------------------------------------------------
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_workspace ON public.activities(workspace_id);
CREATE INDEX idx_activities_lead ON public.activities(lead_id);
CREATE INDEX idx_activities_created_at ON public.activities(created_at);

-------------------------------------------------------
-- 7. LEAD_NOTES TABLE
-------------------------------------------------------
CREATE TABLE public.lead_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_notes_workspace ON public.lead_notes(workspace_id);
CREATE INDEX idx_lead_notes_lead ON public.lead_notes(lead_id);

-------------------------------------------------------
-- 8. INVITATIONS TABLE
-------------------------------------------------------
CREATE TABLE public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'agent')),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_workspace ON public.invitations(workspace_id);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-------------------------------------------------------
-- 9. WORKSPACE_SETTINGS TABLE
-------------------------------------------------------
CREATE TABLE public.workspace_settings (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    currency TEXT NOT NULL DEFAULT 'USD',
    hot_lead_inactivity_hours INTEGER NOT NULL DEFAULT 48 CHECK (hot_lead_inactivity_hours > 0),
    new_lead_contact_threshold_hours INTEGER NOT NULL DEFAULT 4 CHECK (new_lead_contact_threshold_hours > 0),
    high_value_threshold NUMERIC NULL CHECK (high_value_threshold IS NULL OR high_value_threshold >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-------------------------------------------------------
-- REUSABLE UPDATED_AT TRIGGER FUNCTION
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply triggers
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workspace_members_updated_at BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lead_notes_updated_at BEFORE UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_workspace_settings_updated_at BEFORE UPDATE ON public.workspace_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-------------------------------------------------------
-- AUTOMATIC PROFILE INITIALIZATION TRIGGER
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-------------------------------------------------------
-- HARDENED DATABASE SECURITY FUNCTIONS
-- Strictly derives identity from auth.uid() internally.
-------------------------------------------------------

-- Check active workspace membership for the currently authenticated user
CREATE OR REPLACE FUNCTION public.is_active_workspace_member(
    p_workspace_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND status = 'active'
    );
END;
$$;

-- Get workspace role for the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_workspace_role(
    p_workspace_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role INTO v_role
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND status = 'active';

    RETURN v_role;
END;
$$;

-- Revoke PUBLIC execution and grant exclusively to authenticated
REVOKE EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_workspace_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_role(UUID) TO authenticated;

-------------------------------------------------------
-- ATOMIC WORKSPACE CREATION RPC
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace(
    p_name TEXT,
    p_slug TEXT,
    p_timezone TEXT DEFAULT 'UTC',
    p_currency TEXT DEFAULT 'USD'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_workspace_id UUID;
    v_clean_slug TEXT;
    v_workspace_record RECORD;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a workspace';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Workspace name cannot be empty';
    END IF;

    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RAISE EXCEPTION 'Workspace slug cannot be empty';
    END IF;

    v_clean_slug := lower(trim(p_slug));

    -- Check case-insensitive slug uniqueness before insertion
    IF EXISTS (SELECT 1 FROM public.workspaces WHERE lower(slug) = v_clean_slug) THEN
        RAISE EXCEPTION 'Workspace slug "%" is already taken. Please choose another.', trim(p_slug);
    END IF;

    -- 1. Insert Workspace (owner_user_id locked to auth.uid())
    INSERT INTO public.workspaces (name, slug, owner_user_id, timezone, currency)
    VALUES (trim(p_name), v_clean_slug, v_user_id, p_timezone, p_currency)
    RETURNING id INTO v_workspace_id;

    -- 2. Insert Workspace Owner Member (role = owner, status = active)
    INSERT INTO public.workspace_members (workspace_id, user_id, role, status, joined_at)
    VALUES (v_workspace_id, v_user_id, 'owner', 'active', NOW());

    -- 3. Insert Workspace Settings
    INSERT INTO public.workspace_settings (workspace_id, timezone, currency)
    VALUES (v_workspace_id, p_timezone, p_currency);

    -- Return created workspace details
    SELECT id, name, slug, owner_user_id, timezone, currency, created_at
    INTO v_workspace_record
    FROM public.workspaces
    WHERE id = v_workspace_id;

    RETURN to_jsonb(v_workspace_record);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-------------------------------------------------------

-- Enable RLS on all 9 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES POLICIES
CREATE POLICY "Users can read own profile or profiles of workspace co-members"
    ON public.profiles FOR SELECT
    USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.workspace_members wm1
            JOIN public.workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
            WHERE wm1.user_id = auth.uid() AND wm1.status = 'active'
              AND wm2.user_id = public.profiles.id AND wm2.status = 'active'
        )
    );

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 2. WORKSPACES POLICIES
CREATE POLICY "Active members can select workspace"
    ON public.workspaces FOR SELECT
    USING (public.is_active_workspace_member(id));

CREATE POLICY "Workspace owners can update workspace details"
    ON public.workspaces FOR UPDATE
    USING (owner_user_id = auth.uid() AND public.is_active_workspace_member(id))
    WITH CHECK (owner_user_id = auth.uid() AND public.is_active_workspace_member(id));

-- 3. WORKSPACE_MEMBERS POLICIES
CREATE POLICY "Members can view members in their active workspaces"
    ON public.workspace_members FOR SELECT
    USING (public.is_active_workspace_member(workspace_id));

CREATE POLICY "Owners and managers can manage workspace members"
    ON public.workspace_members FOR ALL
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );

-- 4. LEADS POLICIES
CREATE POLICY "Active workspace members can select leads"
    ON public.leads FOR SELECT
    USING (public.is_active_workspace_member(workspace_id));

CREATE POLICY "Active workspace members can insert leads"
    ON public.leads FOR INSERT
    WITH CHECK (public.is_active_workspace_member(workspace_id));

CREATE POLICY "Active workspace members can update leads"
    ON public.leads FOR UPDATE
    USING (public.is_active_workspace_member(workspace_id))
    WITH CHECK (public.is_active_workspace_member(workspace_id));

-- 5. FOLLOW_UPS POLICIES
CREATE POLICY "Active workspace members can access follow_ups"
    ON public.follow_ups FOR ALL
    USING (public.is_active_workspace_member(workspace_id))
    WITH CHECK (public.is_active_workspace_member(workspace_id));

-- 6. ACTIVITIES POLICIES
CREATE POLICY "Active workspace members can view activities"
    ON public.activities FOR SELECT
    USING (public.is_active_workspace_member(workspace_id));

CREATE POLICY "Active workspace members can insert activities"
    ON public.activities FOR INSERT
    WITH CHECK (public.is_active_workspace_member(workspace_id));

-- 7. LEAD_NOTES POLICIES
CREATE POLICY "Active workspace members can access lead notes"
    ON public.lead_notes FOR ALL
    USING (public.is_active_workspace_member(workspace_id))
    WITH CHECK (public.is_active_workspace_member(workspace_id));

-- 8. INVITATIONS POLICIES
CREATE POLICY "Owners and managers can view and manage invitations"
    ON public.invitations FOR ALL
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    )
    WITH CHECK (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );

-- 9. WORKSPACE_SETTINGS POLICIES
CREATE POLICY "Active workspace members can view settings"
    ON public.workspace_settings FOR SELECT
    USING (public.is_active_workspace_member(workspace_id));

CREATE POLICY "Owners and managers can update settings"
    ON public.workspace_settings FOR UPDATE
    USING (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    )
    WITH CHECK (
        public.is_active_workspace_member(workspace_id)
        AND public.get_workspace_role(workspace_id) IN ('owner', 'manager')
    );
