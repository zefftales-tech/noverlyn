import { supabase } from './supabase'
import type { Database, WorkspaceRole, MemberStatus } from '../types/database.types'

type Invitation = Database['public']['Tables']['invitations']['Row']

export interface TeamMemberItem {
  id: string
  userId: string
  role: WorkspaceRole
  status: MemberStatus
  joinedAt: string | null
  createdAt: string
  fullName: string
  avatarUrl: string | null
  email: string
  activeLeadsCount: number
  dueTodayCount: number
  overdueCount: number
  atRiskCount: number
  wonDealsCount: number
}

export interface PendingInvitationItem {
  id: string
  email: string
  role: WorkspaceRole
  expiresAt: string
  invitedBy: string
  createdAt: string
  invitedByName?: string
}

export interface InvitationStatusInfo {
  status: 'valid' | 'accepted' | 'revoked' | 'expired' | 'invalid'
  workspace_name?: string
  workspace_id?: string
  email?: string
  role?: string
}

interface SupabaseErrorLike {
  code?: string
  message?: string
  details?: string
  hint?: string
}

async function callRpc<T>(fnName: string, params: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase client uninitialized')
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: SupabaseErrorLike | null }>)(fnName, params)

  if (error) {
    console.error(`[RPC Error: ${fnName}]`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    throw new Error(error.message || `RPC ${fnName} failed`)
  }
  return data as T
}

export const teamApi = {
  // Get Fast Invitation Status
  getInvitationStatus: async (rawToken: string): Promise<InvitationStatusInfo> => {
    return callRpc<InvitationStatusInfo>('get_invitation_status_rpc', {
      p_raw_token: rawToken,
    })
  },

  // Create Invitation
  createInvitation: async (workspaceId: string, email: string, role: WorkspaceRole): Promise<string> => {
    return callRpc<string>('create_workspace_invitation_rpc', {
      p_workspace_id: workspaceId,
      p_email: email,
      p_role: role,
    })
  },

  // Accept Invitation
  acceptInvitation: async (rawToken: string): Promise<string> => {
    return callRpc<string>('accept_invitation_rpc', {
      p_raw_token: rawToken,
    })
  },

  // Revoke Invitation
  revokeInvitation: async (invitationId: string): Promise<void> => {
    return callRpc<void>('revoke_workspace_invitation_rpc', {
      p_invitation_id: invitationId,
    })
  },

  // Update Member Role
  updateMemberRole: async (workspaceId: string, targetUserId: string, newRole: WorkspaceRole): Promise<void> => {
    return callRpc<void>('update_workspace_member_role_rpc', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
      p_new_role: newRole,
    })
  },

  // Set Member Status (Disable / Activate)
  setMemberStatus: async (workspaceId: string, targetUserId: string, newStatus: MemberStatus): Promise<void> => {
    return callRpc<void>('set_workspace_member_status_rpc', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
      p_new_status: newStatus,
    })
  },

  // Remove Workspace Member
  removeMember: async (workspaceId: string, targetUserId: string): Promise<void> => {
    return callRpc<void>('remove_workspace_member_rpc', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
    })
  },

  // Fetch Team Members with workload metrics
  getTeamMembers: async (workspaceId: string): Promise<TeamMemberItem[]> => {
    if (!supabase) return []

    // 1. Fetch workspace members
    const { data: memsData, error: memsErr } = await supabase
      .from('workspace_members')
      .select('id, user_id, role, status, joined_at, created_at')
      .eq('workspace_id', workspaceId)

    if (memsErr) {
      console.error('[Error fetching workspace_members]', memsErr)
      throw new Error(memsErr.message || 'Failed to fetch workspace members')
    }

    const mems = (memsData || []) as Array<{
      id: string
      user_id: string
      role: WorkspaceRole
      status: MemberStatus
      joined_at: string | null
      created_at: string
    }>

    if (mems.length === 0) return []

    // 2. Fetch profiles for user_ids
    const userIds = mems.map((m) => m.user_id)
    const { data: profsData, error: profsErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    if (profsErr) {
      console.error('[Error fetching profiles for team]', profsErr)
    }

    const profsMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
    if (profsData) {
      (profsData as Array<{ id: string; full_name: string; avatar_url: string | null }>).forEach((p) => {
        profsMap[p.id] = p
      })
    }

    // 3. Fetch leads to compute per-member factual metrics
    const { data: leadsData } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId)

    const leads = (leadsData || []) as Array<Database['public']['Tables']['leads']['Row']>

    // 4. Fetch scheduled follow ups
    const { data: followUpsData } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'scheduled')

    const followUps = (followUpsData || []) as Array<Database['public']['Tables']['follow_ups']['Row']>
    const now = new Date()

    return mems.map((m) => {
      const prof = profsMap[m.user_id]
      const userLeads = leads.filter((l) => l.assigned_to === m.user_id)
      const activeLeadsCount = userLeads.filter((l) => l.status === 'active').length
      const wonDealsCount = userLeads.filter((l) => l.status === 'won').length

      const userFollowUps = followUps.filter((f) => f.assigned_to === m.user_id)
      const overdueCount = userFollowUps.filter((f) => new Date(f.scheduled_at) < now).length
      const dueTodayCount = userFollowUps.filter((f) => {
        const d = new Date(f.scheduled_at)
        return d >= now && d.toDateString() === now.toDateString()
      }).length

      const atRiskCount = userLeads.filter(
        (l) => l.status === 'active' && (l.priority === 'hot' || l.stage === 'new' || l.stage === 'negotiation')
      ).length

      let fallbackName = prof?.full_name || 'Member'
      if (m.status === 'removed' && !fallbackName.includes('(Former Member)')) {
        fallbackName = `${fallbackName} (Former Member)`
      }
      const fallbackEmail = `${fallbackName.toLowerCase().replace(/\s+/g, '.')}@workspace`

      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        status: m.status,
        joinedAt: m.joined_at,
        createdAt: m.created_at,
        fullName: fallbackName,
        avatarUrl: prof?.avatar_url || null,
        email: fallbackEmail,
        activeLeadsCount,
        dueTodayCount,
        overdueCount,
        atRiskCount,
        wonDealsCount,
      }
    })
  },

  // Fetch Pending Invitations
  getPendingInvitations: async (workspaceId: string): Promise<PendingInvitationItem[]> => {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Error fetching invitations]', error)
      throw new Error(error.message || 'Failed to fetch pending invitations')
    }

    const invs = (data || []) as Invitation[]
    return invs.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at,
      invitedBy: inv.invited_by,
      createdAt: inv.created_at,
    }))
  },
}
