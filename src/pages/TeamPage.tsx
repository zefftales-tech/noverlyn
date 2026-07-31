import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { useWorkspace } from '../hooks/useWorkspace'
import { teamApi, type TeamMemberItem, type PendingInvitationItem } from '../lib/teamApi'

import { InviteMemberModal } from '../components/team/InviteMemberModal'
import { EditMemberRoleModal } from '../components/team/EditMemberRoleModal'
import { RemoveMemberModal } from '../components/team/RemoveMemberModal'
import { MemberDetailDrawer } from '../components/team/MemberDetailDrawer'

import {
  Users,
  UserPlus,
  Trash2,
  AlertTriangle,
  BarChart2,
  Sliders,
  CheckCircle2,
  UserMinus,
  UserCheck
} from 'lucide-react'

type TeamTab = 'active' | 'disabled' | 'former' | 'invitations'

export const TeamPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [activeTab, setActiveTab] = useState<TeamTab>('active')
  const [members, setMembers] = useState<TeamMemberItem[]>([])
  const [invitations, setInvitations] = useState<PendingInvitationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Modals & Drawer State
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMemberItem | null>(null)
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false)
  const [isRemoveOpen, setIsRemoveOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const loadTeamData = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const [memsData, invsData] = await Promise.all([
        teamApi.getTeamMembers(currentWorkspace.id),
        teamApi.getPendingInvitations(currentWorkspace.id),
      ])
      setMembers(memsData)
      setInvitations(invsData)
    } catch (err: unknown) {
      console.error('[TeamPage error loading data]', err)
      const errorMsg = err instanceof Error ? err.message : 'Could not load workspace team data'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadTeamData()
    })
  }, [loadTeamData])

  const handleRevokeInvitation = async (invId: string) => {
    if (!confirm('Revoke this pending workspace invitation?')) return
    setRevokingId(invId)
    setError(null)

    try {
      await teamApi.revokeInvitation(invId)
      setInvitations((prev) => prev.filter((i) => i.id !== invId))
    } catch (err: unknown) {
      console.error('[Error revoking invitation]', err)
      const errorMsg = err instanceof Error ? err.message : 'Could not revoke invitation'
      setError(errorMsg)
    } finally {
      setRevokingId(null)
    }
  }

  const handleToggleStatus = async (m: TeamMemberItem, newStatus: 'active' | 'disabled') => {
    if (!currentWorkspace) return
    try {
      await teamApi.setMemberStatus(currentWorkspace.id, m.userId, newStatus)
      loadTeamData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const activeMembers = members.filter((m) => m.status === 'active')
  const disabledMembers = members.filter((m) => m.status === 'disabled')
  const formerMembers = members.filter((m) => m.status === 'removed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl text-navy-900">Team Operations</h1>
            <Badge variant="blue" className="font-bold">{activeMembers.length} Active Members</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Workspace access control, role permissions, and factual workload distribution for <span className="font-semibold text-navy-900">{currentWorkspace?.name}</span>
          </p>
        </div>

        {isOwnerOrManager && (
          <Button variant="primary" size="sm" icon={<UserPlus className="w-4 h-4" />} onClick={() => setIsInviteOpen(true)}>
            Invite Team Member
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Team Operations Alert</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="border-b border-surface-border flex gap-4 sm:gap-6 overflow-x-auto text-xs font-semibold select-none no-scrollbar">
        <button
          onClick={() => setActiveTab('active')}
          className={`pb-3 border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'active'
              ? 'border-brand-blue text-brand-blue font-bold'
              : 'border-transparent text-content-secondary hover:text-navy-900'
          }`}
        >
          ACTIVE MEMBERS ({activeMembers.length})
        </button>

        <button
          onClick={() => setActiveTab('disabled')}
          className={`pb-3 border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'disabled'
              ? 'border-brand-blue text-brand-blue font-bold'
              : 'border-transparent text-content-secondary hover:text-navy-900'
          }`}
        >
          DISABLED ({disabledMembers.length})
        </button>

        <button
          onClick={() => setActiveTab('former')}
          className={`pb-3 border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'former'
              ? 'border-brand-blue text-brand-blue font-bold'
              : 'border-transparent text-content-secondary hover:text-navy-900'
          }`}
        >
          FORMER MEMBERS ({formerMembers.length})
        </button>

        <button
          onClick={() => setActiveTab('invitations')}
          className={`pb-3 border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'invitations'
              ? 'border-brand-blue text-brand-blue font-bold'
              : 'border-transparent text-content-secondary hover:text-navy-900'
          }`}
        >
          PENDING INVITATIONS ({invitations.length})
        </button>
      </div>

      {/* TAB CONTENT: ACTIVE MEMBERS */}
      {activeTab === 'active' && (
        <>
          {loading ? (
            <Card><LoadingState label="Loading workspace members..." /></Card>
          ) : activeMembers.length === 0 ? (
            <Card>
              <EmptyState
                title="No active workspace members"
                description="Invite sales agents and operations managers to collaborate on lead follow-ups."
                icon={<Users className="w-10 h-10 text-brand-blue" />}
                action={
                  isOwnerOrManager ? (
                    <Button variant="primary" size="sm" icon={<UserPlus className="w-4 h-4" />} onClick={() => setIsInviteOpen(true)}>
                      Invite Team Member
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3.5">Member</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-center">Active Leads</th>
                      <th className="p-3.5 text-center">Due Today</th>
                      <th className="p-3.5 text-center">Overdue</th>
                      <th className="p-3.5 text-center">Won Deals</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {activeMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.fullName} url={m.avatarUrl} size="sm" />
                            <div>
                              <span className="font-bold text-navy-900 block">{m.fullName}</span>
                              <span className="text-[11px] text-content-muted">{m.email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <Badge variant={m.role === 'owner' ? 'critical' : m.role === 'manager' ? 'warning' : 'blue'}>
                            {m.role.toUpperCase()}
                          </Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="success">ACTIVE</Badge>
                        </td>

                        <td className="p-3.5 text-center font-bold text-navy-900">{m.activeLeadsCount}</td>
                        <td className="p-3.5 text-center font-bold text-brand-blue">{m.dueTodayCount}</td>
                        <td className="p-3.5 text-center font-bold text-status-critical">
                          {m.overdueCount > 0 ? `${m.overdueCount} Overdue` : '0'}
                        </td>
                        <td className="p-3.5 text-center font-bold text-emerald-600">{m.wonDealsCount}</td>

                        <td className="p-3.5 text-right space-x-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<BarChart2 className="w-3.5 h-3.5" />}
                            onClick={() => {
                              setSelectedMember(m)
                              setIsDrawerOpen(true)
                            }}
                          >
                            Workload
                          </Button>

                          {isOwnerOrManager && m.role !== 'owner' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Sliders className="w-3.5 h-3.5" />}
                                onClick={() => {
                                  setSelectedMember(m)
                                  setIsEditRoleOpen(true)
                                }}
                              >
                                Manage
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<UserMinus className="w-3.5 h-3.5 text-status-critical" />}
                                onClick={() => {
                                  setSelectedMember(m)
                                  setIsRemoveOpen(true)
                                }}
                              >
                                Remove
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB CONTENT: DISABLED MEMBERS */}
      {activeTab === 'disabled' && (
        <>
          {disabledMembers.length === 0 ? (
            <Card>
              <EmptyState
                title="No disabled members"
                description="Members whose workspace access has been temporarily revoked appear here."
                icon={<CheckCircle2 className="w-10 h-10 text-emerald-600" />}
              />
            </Card>
          ) : (
            <div className="bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3.5">Member</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-center">Active Assigned Leads</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {disabledMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.fullName} url={m.avatarUrl} size="sm" />
                            <div>
                              <span className="font-bold text-navy-900 block">{m.fullName}</span>
                              <span className="text-[11px] text-content-muted">{m.email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="neutral">{m.role.toUpperCase()}</Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="neutral">DISABLED — NO ACCESS</Badge>
                        </td>

                        <td className="p-3.5 text-center font-bold text-navy-900">{m.activeLeadsCount}</td>

                        <td className="p-3.5 text-right space-x-1.5">
                          {isOwnerOrManager && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<UserCheck className="w-3.5 h-3.5 text-emerald-600" />}
                              onClick={() => handleToggleStatus(m, 'active')}
                            >
                              Reactivate
                            </Button>
                          )}

                          {isOwnerOrManager && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<UserMinus className="w-3.5 h-3.5 text-status-critical" />}
                              onClick={() => {
                                setSelectedMember(m)
                                setIsRemoveOpen(true)
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB CONTENT: FORMER MEMBERS */}
      {activeTab === 'former' && (
        <>
          {formerMembers.length === 0 ? (
            <Card>
              <EmptyState
                title="No former members"
                description="Members removed from this workspace while retaining historical work records appear here."
                icon={<Users className="w-10 h-10 text-slate-400" />}
              />
            </Card>
          ) : (
            <div className="bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3.5">Former Member</th>
                      <th className="p-3.5">Prior Role</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-center">Historical Won Deals</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {formerMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.fullName} url={m.avatarUrl} size="sm" />
                            <div>
                              <span className="font-bold text-navy-900 block">{m.fullName}</span>
                              <span className="text-[11px] text-content-muted">Former Workspace Member</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="neutral">{m.role.toUpperCase()}</Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="critical">REMOVED</Badge>
                        </td>

                        <td className="p-3.5 text-center font-bold text-emerald-600">{m.wonDealsCount}</td>

                        <td className="p-3.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<BarChart2 className="w-3.5 h-3.5" />}
                            onClick={() => {
                              setSelectedMember(m)
                              setIsDrawerOpen(true)
                            }}
                          >
                            Historical Work
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB CONTENT: PENDING INVITATIONS */}
      {activeTab === 'invitations' && (
        <>
          {loading ? (
            <Card><LoadingState label="Loading pending invitations..." /></Card>
          ) : invitations.length === 0 ? (
            <Card>
              <EmptyState
                title="No pending invitations"
                description="All invited team members have joined your workspace."
                icon={<CheckCircle2 className="w-10 h-10 text-emerald-600" />}
              />
            </Card>
          ) : (
            <div className="bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3.5">Invited Email</th>
                      <th className="p-3.5">Intended Role</th>
                      <th className="p-3.5">Invited Date</th>
                      <th className="p-3.5">Expiration</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 font-bold text-navy-900">{inv.email}</td>

                        <td className="p-3.5">
                          <Badge variant="blue">{inv.role.toUpperCase()}</Badge>
                        </td>

                        <td className="p-3.5 text-content-secondary">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </td>

                        <td className="p-3.5 text-content-secondary">
                          {new Date(inv.expiresAt).toLocaleDateString()}
                        </td>

                        <td className="p-3.5 text-right space-x-1.5">
                          {isOwnerOrManager && (
                            <Button
                              variant="ghost"
                              size="sm"
                              isLoading={revokingId === inv.id}
                              disabled={revokingId === inv.id}
                              icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                              onClick={() => handleRevokeInvitation(inv.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals & Drawer */}
      <InviteMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        onSuccess={loadTeamData}
      />

      <EditMemberRoleModal
        isOpen={isEditRoleOpen}
        onClose={() => setIsEditRoleOpen(false)}
        member={selectedMember}
        onSuccess={loadTeamData}
      />

      <RemoveMemberModal
        isOpen={isRemoveOpen}
        onClose={() => setIsRemoveOpen(false)}
        member={selectedMember}
        onSuccess={loadTeamData}
      />

      <MemberDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        member={selectedMember}
      />
    </div>
  )
}
