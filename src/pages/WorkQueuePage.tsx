import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { useWorkspace } from '../hooks/useWorkspace'
import { leadsApi } from '../lib/leadsApi'
import {
  fetchWorkspaceAttentionItems,
  type AttentionItem,
  getUrgencyBadgeVariant,
  getIssueBadgeVariant
} from '../lib/attentionEngine'
import type { Database, LeadStage, LeadStatus } from '../types/database.types'

import { AssignLeadModal } from '../components/leads/AssignLeadModal'
import { LogContactModal } from '../components/leads/LogContactModal'
import { ScheduleFollowUpModal } from '../components/leads/ScheduleFollowUpModal'
import { CompleteFollowUpModal } from '../components/leads/CompleteFollowUpModal'

import {
  CheckCircle2,
  Phone,
  ArrowRight,
  UserCheck,
  PhoneCall,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Sparkles
} from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']
type FollowUp = Database['public']['Tables']['follow_ups']['Row']

export const WorkQueuePage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialFilter = searchParams.get('filter') || 'all'
  const [activeTab, setActiveTab] = useState<string>(initialFilter)
  const [selectedAgent, setSelectedAgent] = useState<string>('all')

  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
  const [membersMap, setMembersMap] = useState<Record<string, string>>({})
  const [membersList, setMembersList] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [activeFollowUp, setActiveFollowUp] = useState<FollowUp | null>(null)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [isLogContactOpen, setIsLogContactOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [isCompleteOpen, setIsCompleteOpen] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const loadWorkQueue = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch canonical attention items
      const agentFilterParam = selectedAgent !== 'all' ? selectedAgent : undefined
      const data = await fetchWorkspaceAttentionItems(currentWorkspace.id, agentFilterParam)
      setAttentionItems(data)

      // 2. Fetch workspace members
      const members = await leadsApi.getWorkspaceMembers(currentWorkspace.id)
      const map: Record<string, string> = {}
      members.forEach((m) => {
        map[m.userId] = m.fullName
      })
      setMembersMap(map)
      setMembersList(members)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load Work Queue'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, selectedAgent])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadWorkQueue()
    })

    const handleUpdate = () => loadWorkQueue()
    window.addEventListener('noverlyn:lead_created', handleUpdate)
    return () => window.removeEventListener('noverlyn:lead_created', handleUpdate)
  }, [loadWorkQueue])

  // Filter items based on active tab
  const filteredItems = attentionItems.filter((item) => {
    if (activeTab === 'overdue') return item.primary_issue === 'overdue_follow_up'
    if (activeTab === 'due_today') return item.primary_issue === 'due_today'
    if (activeTab === 'at_risk') {
      return (
        item.primary_issue === 'hot_lead_inactive' ||
        item.primary_issue === 'new_lead_waiting' ||
        item.primary_issue === 'negotiation_no_action' ||
        item.primary_issue === 'high_value_at_risk'
      )
    }
    if (activeTab === 'unassigned') return item.primary_issue === 'unassigned_lead'
    if (activeTab === 'upcoming') return item.next_follow_up_at && new Date(item.next_follow_up_at) > new Date()
    return true // 'all'
  })

  // Quick Action Handler helper to construct Lead object for modal
  const makeLeadObject = (item: AttentionItem): Lead => {
    return {
      id: item.lead_id,
      workspace_id: item.workspace_id,
      assigned_to: item.assigned_to,
      full_name: item.lead_name,
      phone: item.phone,
      email: item.email,
      source: item.source,
      requirement: item.requirement,
      priority: item.priority,
      stage: item.stage as LeadStage,
      status: item.status as LeadStatus,
      estimated_value: item.estimated_value,
      budget_min: item.budget_min,
      budget_max: item.budget_max,
      created_by: '',
      last_activity_at: item.last_activity_at,
      last_contacted_at: item.last_contacted_at,
      next_follow_up_at: item.next_follow_up_at,
      won_at: null,
      lost_reason: null,
      lost_notes: null,
      lost_at: null,
      created_at: item.created_at,
      updated_at: item.created_at,
    }
  }

  const handleQuickAction = (item: AttentionItem, actionType: 'complete' | 'log_contact' | 'schedule' | 'assign') => {
    const l = makeLeadObject(item)
    setActiveLead(l)

    if (actionType === 'complete') {
      setActiveFollowUp({
        id: 'fu_active',
        workspace_id: item.workspace_id,
        lead_id: item.lead_id,
        assigned_to: item.assigned_to,
        scheduled_at: item.next_follow_up_at || new Date().toISOString(),
        completed_at: null,
        status: 'scheduled',
        type: 'call',
        outcome: null,
        notes: item.primary_issue_detail,
        created_by: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      setIsCompleteOpen(true)
    } else if (actionType === 'log_contact') {
      setIsLogContactOpen(true)
    } else if (actionType === 'schedule') {
      setIsScheduleOpen(true)
    } else if (actionType === 'assign') {
      setIsAssignOpen(true)
    }
  }

  const agentOptions = [
    { value: 'all', label: 'All Workspace Agents' },
    ...membersList.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading font-bold text-2xl text-navy-900">Daily Work Queue</h1>
            <Badge variant="critical" className="font-bold px-2.5 py-0.5">{attentionItems.length} Items</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Prioritized actions and follow-ups organized by urgency and deal value.
          </p>
        </div>

        {/* Role-aware Agent filter for Owner/Manager */}
        {isOwnerOrManager ? (
          <div className="w-56">
            <Select
              options={agentOptions}
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-content-secondary bg-surface-card px-3.5 py-2 rounded-xl border border-surface-border shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-brand-blue" />
            <span>Scope: <strong className="text-navy-900 font-semibold">Assigned Queue</strong></span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Modern Filter Tabs Bar */}
      <div className="bg-surface-card p-1.5 rounded-xl border border-surface-border flex gap-1.5 overflow-x-auto text-xs font-semibold select-none no-scrollbar shadow-2xs">
        {[
          { key: 'all', label: `ALL (${attentionItems.length})` },
          { key: 'ai_reply', label: '✨ AI: REPLY NOW' },
          { key: 'ai_qualification', label: '✨ AI: QUALIFICATION NEEDED' },
          { key: 'ai_review', label: '✨ AI: SUGGESTIONS AWAITING REVIEW' },
          { key: 'overdue', label: `OVERDUE (${attentionItems.filter((i) => i.primary_issue === 'overdue_follow_up').length})` },
          { key: 'due_today', label: `DUE TODAY (${attentionItems.filter((i) => i.primary_issue === 'due_today').length})` },
          { key: 'at_risk', label: `AT RISK (${attentionItems.filter((i) => ['hot_lead_inactive', 'new_lead_waiting', 'negotiation_no_action', 'high_value_at_risk'].includes(i.primary_issue)).length})` },
          { key: 'unassigned', label: `UNASSIGNED (${attentionItems.filter((i) => i.primary_issue === 'unassigned_lead').length})` },
          { key: 'upcoming', label: 'UPCOMING' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              setSearchParams({ filter: tab.key })
            }}
            className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all duration-150 text-xs font-medium ${
              activeTab === tab.key
                ? 'bg-navy-900 text-white shadow-xs font-semibold'
                : 'text-content-secondary hover:text-navy-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* QUEUE CONTENT */}
      {loading ? (
        <Card><LoadingState label="Computing deterministic work queue..." /></Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <EmptyState
            title="You're all caught up!"
            description="No active items currently require attention for this filter category."
            icon={<Sparkles className="w-10 h-10 text-emerald-600" />}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/80 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Urgency</th>
                  <th className="p-3.5">Lead Name</th>
                  <th className="p-3.5">Primary Attention Reason</th>
                  <th className="p-3.5">Stage</th>
                  <th className="p-3.5">Est. Value</th>
                  <th className="p-3.5">Assigned Agent</th>
                  <th className="p-3.5 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredItems.map((item) => (
                  <tr key={item.lead_id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-3.5">
                      <Badge variant={getUrgencyBadgeVariant(item.urgency_level)} className="font-bold">
                        {item.urgency_level}
                      </Badge>
                    </td>

                    <td className="p-3.5">
                      <div
                        onClick={() => navigate(`/leads/${item.lead_id}`)}
                        className="font-bold text-navy-900 hover:text-brand-blue cursor-pointer transition-colors"
                      >
                        {item.lead_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-content-secondary">
                        <Badge
                          variant={item.priority === 'hot' ? 'critical' : item.priority === 'warm' ? 'warning' : 'neutral'}
                          size="sm"
                        >
                          {item.priority.toUpperCase()}
                        </Badge>
                        <span className="flex items-center gap-1 font-medium">
                          <Phone className="w-3 h-3 text-content-muted" /> {item.phone}
                        </span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-navy-900">{item.primary_issue_label}</div>
                      <p className="text-[11px] text-content-secondary mt-0.5">{item.primary_issue_detail}</p>
                      {item.secondary_issues && item.secondary_issues.length > 0 && (
                        <div className="flex items-center gap-1 pt-1 flex-wrap">
                          {item.secondary_issues.map((sec, idx) => (
                            <Badge key={idx} variant={getIssueBadgeVariant(sec.type)} size="sm">
                              {sec.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 font-semibold text-navy-900 uppercase text-[10px]">
                      {item.stage.replace('_', ' ')}
                    </td>

                    <td className="p-3.5 font-bold text-navy-900">
                      {item.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${item.estimated_value.toLocaleString()}` : '—'}
                    </td>

                    <td className="p-3.5 font-medium text-navy-900">
                      {item.assigned_to ? membersMap[item.assigned_to] || 'Agent Assigned' : <span className="text-content-muted italic">Unassigned</span>}
                    </td>

                    <td className="p-3.5 text-right space-x-1.5">
                      {item.primary_issue === 'overdue_follow_up' || item.primary_issue === 'due_today' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => handleQuickAction(item, 'complete')}
                        >
                          Complete
                        </Button>
                      ) : item.primary_issue === 'new_lead_waiting' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<PhoneCall className="w-3.5 h-3.5" />}
                          onClick={() => handleQuickAction(item, 'log_contact')}
                        >
                          Log Contact
                        </Button>
                      ) : item.primary_issue === 'unassigned_lead' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<UserCheck className="w-3.5 h-3.5" />}
                          onClick={() => handleQuickAction(item, 'assign')}
                        >
                          Assign Agent
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Calendar className="w-3.5 h-3.5" />}
                          onClick={() => handleQuickAction(item, 'schedule')}
                        >
                          Schedule
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        icon={<ArrowRight className="w-3.5 h-3.5" />}
                        onClick={() => navigate(`/leads/${item.lead_id}`)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards View */}
          <div className="lg:hidden grid grid-cols-1 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.lead_id}
                className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <Badge variant={getUrgencyBadgeVariant(item.urgency_level)} className="font-bold">
                    {item.urgency_level} ATTENTION
                  </Badge>
                  <span className="font-bold text-xs text-navy-900 uppercase">{item.stage.replace('_', ' ')}</span>
                </div>

                <div>
                  <h3
                    onClick={() => navigate(`/leads/${item.lead_id}`)}
                    className="font-heading font-bold text-base text-navy-900 hover:text-brand-blue cursor-pointer"
                  >
                    {item.lead_name}
                  </h3>
                  <p className="text-xs font-bold text-navy-900 mt-1">{item.primary_issue_label}</p>
                  <p className="text-xs text-content-secondary mt-0.5">{item.primary_issue_detail}</p>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-surface-border">
                  <span className="text-content-muted">Est. Value: <strong className="text-navy-900">{item.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${item.estimated_value.toLocaleString()}` : '—'}</strong></span>
                  <span className="text-content-muted">Agent: <strong className="text-navy-900">{item.assigned_to ? membersMap[item.assigned_to] || 'Assigned' : 'Unassigned'}</strong></span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                  {item.primary_issue === 'overdue_follow_up' || item.primary_issue === 'due_today' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      onClick={() => handleQuickAction(item, 'complete')}
                    >
                      Complete
                    </Button>
                  ) : item.primary_issue === 'new_lead_waiting' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<PhoneCall className="w-3.5 h-3.5" />}
                      onClick={() => handleQuickAction(item, 'log_contact')}
                    >
                      Log Contact
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Calendar className="w-3.5 h-3.5" />}
                      onClick={() => handleQuickAction(item, 'schedule')}
                    >
                      Schedule
                    </Button>
                  )}

                  <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate(`/leads/${item.lead_id}`)}>
                    Open Detail Page
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Modals */}
      <AssignLeadModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        lead={activeLead}
        onSuccess={loadWorkQueue}
      />

      <LogContactModal
        isOpen={isLogContactOpen}
        onClose={() => setIsLogContactOpen(false)}
        lead={activeLead}
        onSuccess={loadWorkQueue}
      />

      <ScheduleFollowUpModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        lead={activeLead}
        onSuccess={loadWorkQueue}
      />

      <CompleteFollowUpModal
        isOpen={isCompleteOpen}
        onClose={() => setIsCompleteOpen(false)}
        followUp={activeFollowUp}
        onSuccess={loadWorkQueue}
      />
    </div>
  )
}
