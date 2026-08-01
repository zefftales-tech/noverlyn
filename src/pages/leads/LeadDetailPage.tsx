import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Avatar } from '../../components/ui/Avatar'
import { LoadingState } from '../../components/ui/LoadingState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import { fetchWorkspaceAttentionItems, type AttentionItem } from '../../lib/attentionEngine'
import type { Database } from '../../types/database.types'

import { LeadAttentionBanner } from '../../components/leads/LeadAttentionBanner'
import { EditLeadModal } from '../../components/leads/EditLeadModal'
import { LogContactModal } from '../../components/leads/LogContactModal'
import { ScheduleFollowUpModal } from '../../components/leads/ScheduleFollowUpModal'
import { CompleteFollowUpModal } from '../../components/leads/CompleteFollowUpModal'
import { ChangeStageModal } from '../../components/leads/ChangeStageModal'
import { MarkLostModal } from '../../components/leads/MarkLostModal'
import { AssignLeadModal } from '../../components/leads/AssignLeadModal'

import {
  Phone,
  Mail,
  Calendar,
  Clock,
  UserCheck,
  PhoneCall,
  GitPullRequest,
  Edit,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Archive,
  Trash2
} from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']
type Activity = Database['public']['Tables']['activities']['Row']
type FollowUp = Database['public']['Tables']['follow_ups']['Row']
type LeadNote = Database['public']['Tables']['lead_notes']['Row'] & {
  author?: { full_name: string; avatar_url: string | null }
}

export const LeadDetailPage: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>()
  const { currentWorkspace, currentRole } = useWorkspace()
  const navigate = useNavigate()

  const [lead, setLead] = useState<Lead | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [membersMap, setMembersMap] = useState<Record<string, string>>({})
  const [leadAttention, setLeadAttention] = useState<AttentionItem | null>(null)

  const [activeTab, setActiveTab] = useState<'timeline' | 'followups' | 'notes' | 'details'>('timeline')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add Note state
  const [newNoteContent, setNewNoteContent] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)

  // Modals state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isLogContactOpen, setIsLogContactOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [isChangeStageOpen, setIsChangeStageOpen] = useState(false)
  const [isMarkLostOpen, setIsMarkLostOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [isCompleteFollowUpOpen, setIsCompleteFollowUpOpen] = useState(false)

  const loadLeadDetails = useCallback(async () => {
    if (!leadId || !currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const data = await leadsApi.getLeadById(leadId)
      setLead(data.lead)
      setActivities(data.activities)
      setNotes(data.notes)
      setFollowUps(data.followUps)

      // Fetch canonical attention item for this lead
      const attentionData = await fetchWorkspaceAttentionItems(currentWorkspace.id)
      const matchedAttention = attentionData.find((item) => item.lead_id === leadId) || null
      setLeadAttention(matchedAttention)

      // Members map
      const members = await leadsApi.getWorkspaceMembers(currentWorkspace.id)
      const map: Record<string, string> = {}
      members.forEach((m) => {
        map[m.userId] = m.fullName
      })
      setMembersMap(map)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load lead details'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [leadId, currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadLeadDetails()
    })
  }, [loadLeadDetails])

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead || !newNoteContent.trim()) return

    setNoteSubmitting(true)
    try {
      await leadsApi.addNote(lead.id, newNoteContent.trim())
      setNewNoteContent('')
      await loadLeadDetails()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add note')
    } finally {
      setNoteSubmitting(false)
    }
  }

  if (loading) {
    return <Card><LoadingState label="Loading detailed lead record..." /></Card>
  }

  if (error || !lead) {
    return (
      <Card>
        <EmptyState
          title="Lead record not found"
          description={error || 'The requested lead record does not exist or has been removed.'}
          icon={<AlertCircle className="w-10 h-10 text-status-critical" />}
          action={
            <Button variant="outline" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/leads/all')}>
              Return to All Leads
            </Button>
          }
        />
      </Card>
    )
  }

  // Determine next scheduled follow-up
  const upcomingFollowUps = followUps.filter((f) => f.status === 'scheduled')
  const nextFollowUp = upcomingFollowUps.length > 0 ? upcomingFollowUps[0] : null
  const isOverdue = nextFollowUp && new Date(nextFollowUp.scheduled_at) < new Date()

  // Format activity metadata into human-readable description
  const formatActivityText = (act: Activity) => {
    const meta = act.metadata as Record<string, unknown>
    switch (act.activity_type) {
      case 'lead_created':
        return `Lead record created`
      case 'lead_assigned': {
        const newName = meta.new_assignee_id ? membersMap[meta.new_assignee_id as string] || 'an agent' : 'Unassigned'
        return `Assigned lead to ${newName}`
      }
      case 'contact_logged':
        return `Logged contact via ${String(meta.contact_method).toUpperCase()}${meta.outcome ? ` — Outcome: "${meta.outcome}"` : ''}`
      case 'note_added':
        return `Added a new internal note`
      case 'follow_up_created':
        return `Scheduled follow-up ${String(meta.type).toUpperCase()} for ${new Date(meta.scheduled_at as string).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
      case 'follow_up_completed':
        return `Completed follow-up action${meta.outcome ? ` — "${meta.outcome}"` : ''}`
      case 'follow_up_rescheduled':
        return `Rescheduled follow-up to ${new Date(meta.new_scheduled_at as string).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
      case 'follow_up_cancelled':
        return `Cancelled scheduled follow-up`
      case 'stage_changed':
        return `Changed pipeline stage from ${String(meta.from_stage).toUpperCase()} to ${String(meta.to_stage).toUpperCase()}`
      case 'deal_won':
        return `Marked lead as WON DEAL 🎉`
      case 'deal_lost':
        return `Marked lead as LOST — Reason: ${String(meta.lost_reason).toUpperCase()}`
      default:
        return `Activity: ${act.activity_type}`
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-content-secondary hover:text-navy-900 font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </button>

        <span className="text-xs text-content-muted">
          Lead ID: <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{lead.id.slice(0, 8)}</code>
        </span>
      </div>

      {/* EXPLAINABLE ATTENTION BANNER */}
      {leadAttention && (
        <LeadAttentionBanner
          attentionItem={leadAttention}
          onLogContact={() => setIsLogContactOpen(true)}
          onScheduleFollowUp={() => setIsScheduleOpen(true)}
          onCompleteFollowUp={() => {
            if (nextFollowUp) {
              setSelectedFollowUp(nextFollowUp)
              setIsCompleteFollowUpOpen(true)
            } else {
              setIsScheduleOpen(true)
            }
          }}
        />
      )}

      {/* HEADER SECTION */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-navy-900 text-white font-bold text-xl flex items-center justify-center shadow-md">
              {lead.full_name[0]?.toUpperCase() || 'L'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-bold text-2xl text-navy-900">{lead.full_name}</h1>
                <Badge
                  variant={lead.priority === 'hot' ? 'critical' : lead.priority === 'warm' ? 'warning' : 'neutral'}
                >
                  {lead.priority.toUpperCase()} PRIORITY
                </Badge>
                <Badge variant="blue" className="uppercase font-semibold">
                  STAGE: {lead.stage.replace('_', ' ')}
                </Badge>
                {lead.status === 'won' && <Badge variant="success">WON DEAL</Badge>}
                {lead.status === 'lost' && <Badge variant="critical">LOST DEAL</Badge>}
              </div>

              <div className="flex items-center gap-4 text-xs text-content-secondary mt-1 flex-wrap">
                <span className="flex items-center gap-1 font-semibold text-navy-900">
                  <Phone className="w-3.5 h-3.5 text-content-muted" /> {lead.phone}
                </span>
                {lead.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-content-muted" /> {lead.email}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-content-muted" /> Assigned: <strong className="text-navy-900">{lead.assigned_to ? membersMap[lead.assigned_to] || 'Agent' : 'Unassigned'}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<PhoneCall className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={() => setIsLogContactOpen(true)}
            >
              Log Contact
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={<Clock className="w-3.5 h-3.5 text-brand-blue" />}
              onClick={() => setIsScheduleOpen(true)}
            >
              Schedule Follow-up
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<GitPullRequest className="w-3.5 h-3.5" />}
              onClick={() => setIsChangeStageOpen(true)}
            >
              Change Stage
            </Button>

            <Button
              variant="ghost"
              size="sm"
              icon={<Edit className="w-3.5 h-3.5" />}
              onClick={() => setIsEditOpen(true)}
            >
              Edit Lead
            </Button>

            {(currentRole === 'owner' || currentRole === 'manager') && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (confirm('Archive this lead?')) {
                      await leadsApi.archiveLead(lead.id)
                      navigate('/leads/archived')
                    }
                  }}
                  icon={<Archive className="w-3.5 h-3.5 text-brand-blue" />}
                >
                  Archive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const reason = prompt('Reason for moving this lead to Trash:')
                    if (reason !== null) {
                      await leadsApi.softDeleteLead(lead.id, reason || undefined)
                      navigate('/leads/trash')
                    }
                  }}
                  icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                >
                  Trash
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* NEXT ACTION SECTION */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          isOverdue
            ? 'bg-status-critical-bg border-red-200'
            : nextFollowUp
            ? 'bg-brand-blue-light border-blue-200'
            : 'bg-slate-50 border-surface-border'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              isOverdue ? 'bg-status-critical text-white' : nextFollowUp ? 'bg-brand-blue text-white' : 'bg-slate-200 text-content-muted'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-sm text-navy-900">Next Scheduled Follow-up</h3>
              {isOverdue && <span className="bg-status-critical text-white text-[10px] font-bold px-1.5 py-0.2 rounded uppercase">OVERDUE</span>}
            </div>
            {nextFollowUp ? (
              <p className="text-xs text-content-secondary mt-0.5">
                <strong className="text-navy-900">{String(nextFollowUp.type).toUpperCase()}</strong> scheduled for{' '}
                <strong className="text-navy-900">{new Date(nextFollowUp.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                {nextFollowUp.notes ? ` — "${nextFollowUp.notes}"` : ''}
              </p>
            ) : (
              <p className="text-xs text-content-muted mt-0.5">No next follow-up scheduled for this property lead.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {nextFollowUp ? (
            <Button
              variant={isOverdue ? 'danger' : 'primary'}
              size="sm"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={() => {
                setSelectedFollowUp(nextFollowUp)
                setIsCompleteFollowUpOpen(true)
              }}
            >
              Complete Task
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsScheduleOpen(true)}>
              Schedule Follow-up
            </Button>
          )}
        </div>
      </div>

      {/* PUBLIC FORM SUBMISSION DETAILS */}
      {(lead as unknown as { public_form_data?: Record<string, unknown> })?.public_form_data && (
        <Card
          title="Public Form Submission Details"
          subtitle="Captured via public inquiry form with client responses"
        >
          {(() => {
            const formData = (lead as unknown as { public_form_data?: {
              form_title?: string
              source_detail?: string
              submitted_at?: string
              answers?: Record<string, { label: string; type: string; value: string | boolean | number }>
            } }).public_form_data

            const answersObj = formData?.answers || {}
            const answerEntries = Object.entries(answersObj)

            return (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-surface-border rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-content-secondary block">Form Title</span>
                    <span className="font-bold text-navy-900">{formData?.form_title || 'Public Inquiry Form'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-content-secondary block">Source / Channel</span>
                    <span className="font-semibold text-brand-blue">{formData?.source_detail || 'Direct Link'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-content-secondary block">Submission Time</span>
                    <span className="font-medium text-navy-900">
                      {formData?.submitted_at ? new Date(formData.submitted_at).toLocaleString() : '—'}
                    </span>
                  </div>
                </div>

                {answerEntries.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <h4 className="font-bold text-xs text-navy-900 uppercase tracking-wider">Custom Questions & Answers</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {answerEntries.map(([key, item]) => (
                        <div key={key} className="p-3 bg-white border border-surface-border/80 rounded-xl space-y-1">
                          <span className="text-[11px] font-bold text-content-secondary block">{item.label || key}</span>
                          <span className="font-medium text-navy-900 block text-xs">
                            {typeof item.value === 'boolean' ? (item.value ? 'Yes' : 'No') : String(item.value || '—')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </Card>
      )}

      {/* SUMMARY GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="p-3 bg-surface-card border border-surface-border rounded-lg">
          <span className="text-[10px] uppercase font-bold text-content-muted block">Source</span>
          <span className="font-medium text-navy-900 block mt-0.5">{lead.source || '—'}</span>
        </div>
        <div className="p-3 bg-surface-card border border-surface-border rounded-lg">
          <span className="text-[10px] uppercase font-bold text-content-muted block">Requirement</span>
          <span className="font-medium text-navy-900 block mt-0.5 truncate">{lead.requirement || '—'}</span>
        </div>
        <div className="p-3 bg-surface-card border border-surface-border rounded-lg">
          <span className="text-[10px] uppercase font-bold text-content-muted block">Budget Min / Max</span>
          <span className="font-semibold text-navy-900 block mt-0.5">
            {lead.budget_min || lead.budget_max
              ? `${currentWorkspace?.currency || 'USD'} ${lead.budget_min ? lead.budget_min.toLocaleString() : '0'} - ${lead.budget_max ? lead.budget_max.toLocaleString() : 'Max'}`
              : '—'}
          </span>
        </div>
        <div className="p-3 bg-surface-card border border-surface-border rounded-lg">
          <span className="text-[10px] uppercase font-bold text-content-muted block">Est. Deal Value</span>
          <span className="font-semibold text-navy-900 block mt-0.5">
            {lead.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${lead.estimated_value.toLocaleString()}` : '—'}
          </span>
        </div>
        <div className="p-3 bg-surface-card border border-surface-border rounded-lg">
          <span className="text-[10px] uppercase font-bold text-content-muted block">Last Contacted</span>
          <span className="font-medium text-navy-900 block mt-0.5">
            {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : 'Never'}
          </span>
        </div>
        <div className="p-3 bg-surface-card border border-surface-border rounded-lg">
          <span className="text-[10px] uppercase font-bold text-content-muted block">Last Activity</span>
          <span className="font-medium text-navy-900 block mt-0.5">
            {lead.last_activity_at ? new Date(lead.last_activity_at).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="border-b border-surface-border flex gap-6 text-xs font-semibold select-none">
        {[
          { key: 'timeline', label: `Timeline (${activities.length})` },
          { key: 'followups', label: `Follow-ups (${followUps.length})` },
          { key: 'notes', label: `Notes (${notes.length})` },
          { key: 'details', label: 'Lead Details' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`pb-3 border-b-2 transition-all ${
              activeTab === tab.key
                ? 'border-brand-blue text-brand-blue font-bold'
                : 'border-transparent text-content-secondary hover:text-navy-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: TIMELINE */}
      {activeTab === 'timeline' && (
        <Card title="Activity Timeline" subtitle="Chronological history of lead touchpoints, stage changes, and notes">
          {activities.length === 0 ? (
            <p className="text-xs text-content-muted text-center py-6">No activity records recorded yet.</p>
          ) : (
            <div className="relative pl-6 border-l border-surface-border space-y-6 my-2">
              {activities.map((act) => (
                <div key={act.id} className="relative group">
                  <div className="absolute -left-[31px] top-0 w-3.5 h-3.5 rounded-full bg-brand-blue ring-4 ring-white" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-navy-900">{formatActivityText(act)}</span>
                      <span className="text-[11px] text-content-muted">
                        • {new Date(act.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    {act.actor_user_id && (
                      <p className="text-[11px] text-content-secondary">
                        Logged by <strong className="text-navy-900">{membersMap[act.actor_user_id] || 'Team Member'}</strong>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: FOLLOW-UPS */}
      {activeTab === 'followups' && (
        <Card
          title="Scheduled & Historical Follow-ups"
          action={
            <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setIsScheduleOpen(true)}>
              Schedule Follow-up
            </Button>
          }
        >
          {followUps.length === 0 ? (
            <EmptyState
              title="No follow-ups scheduled"
              description="Keep deal momentum by scheduling follow-up calls, meetings, or viewings."
              icon={<Clock className="w-8 h-8 text-brand-blue" />}
              action={
                <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsScheduleOpen(true)}>
                  Schedule Follow-up
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-surface-border text-xs">
              {followUps.map((fu) => {
                const isFuOverdue = fu.status === 'scheduled' && new Date(fu.scheduled_at) < new Date()
                return (
                  <div key={fu.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          fu.status === 'completed'
                            ? 'bg-emerald-100 text-status-success'
                            : fu.status === 'cancelled'
                            ? 'bg-slate-100 text-content-muted'
                            : isFuOverdue
                            ? 'bg-red-100 text-status-critical'
                            : 'bg-blue-100 text-brand-blue'
                        }`}
                      >
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-navy-900 uppercase">{fu.type || 'TASK'}</span>
                          <span className="text-content-secondary">
                            {new Date(fu.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                          <Badge
                            variant={
                              fu.status === 'completed'
                                ? 'success'
                                : fu.status === 'cancelled'
                                ? 'neutral'
                                : isFuOverdue
                                ? 'critical'
                                : 'blue'
                            }
                            size="sm"
                          >
                            {isFuOverdue ? 'OVERDUE' : fu.status.toUpperCase()}
                          </Badge>
                        </div>
                        {fu.notes && <p className="text-content-secondary mt-0.5">"{fu.notes}"</p>}
                        {fu.outcome && <p className="text-status-success font-medium mt-0.5">Outcome: {fu.outcome}</p>}
                      </div>
                    </div>

                    {fu.status === 'scheduled' && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setSelectedFollowUp(fu)
                            setIsCompleteFollowUpOpen(true)
                          }}
                        >
                          Complete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<XCircle className="w-3.5 h-3.5 text-content-muted" />}
                          onClick={async () => {
                            if (confirm('Cancel this scheduled follow-up?')) {
                              await leadsApi.cancelFollowUp(fu.id)
                              loadLeadDetails()
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: NOTES */}
      {activeTab === 'notes' && (
        <Card title="Internal Lead Notes">
          <form onSubmit={handleAddNote} className="space-y-3 mb-6">
            <Input
              placeholder="Write a new internal note regarding client preferences, budget signals, or call feedback..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              leftIcon={<FileText className="w-4 h-4" />}
            />
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" type="submit" isLoading={noteSubmitting} icon={<Plus className="w-3.5 h-3.5" />}>
                Add Note
              </Button>
            </div>
          </form>

          {notes.length === 0 ? (
            <p className="text-xs text-content-muted text-center py-4">No internal notes added yet.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {notes.map((n) => (
                <div key={n.id} className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-content-muted">
                    <div className="flex items-center gap-2">
                      <Avatar name={n.author?.full_name || 'Author'} url={n.author?.avatar_url} size="sm" />
                      <span className="font-semibold text-navy-900">{n.author?.full_name || 'Team Member'}</span>
                    </div>
                    <span>{new Date(n.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <p className="text-content-primary pl-9 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: DETAILS */}
      {activeTab === 'details' && (
        <Card title="Full Lead Metadata">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Full Name:</span>
                <span className="font-bold text-navy-900">{lead.full_name}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Phone:</span>
                <span className="font-semibold text-navy-900">{lead.phone}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Email:</span>
                <span className="font-medium text-navy-900">{lead.email || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Source:</span>
                <span className="font-medium text-navy-900">{lead.source || '—'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Priority:</span>
                <span className="uppercase font-bold text-navy-900">{lead.priority}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Stage:</span>
                <span className="uppercase font-bold text-navy-900">{lead.stage}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-1.5">
                <span className="text-content-secondary">Status:</span>
                <span className="uppercase font-bold text-navy-900">{lead.status}</span>
              </div>
              {lead.lost_reason && (
                <div className="flex justify-between border-b border-surface-border pb-1.5 text-status-critical">
                  <span>Lost Reason:</span>
                  <span className="uppercase font-bold">{lead.lost_reason}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ALL MODALS */}
      <EditLeadModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
      />

      <LogContactModal
        isOpen={isLogContactOpen}
        onClose={() => setIsLogContactOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
      />

      <ScheduleFollowUpModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
      />

      <CompleteFollowUpModal
        isOpen={isCompleteFollowUpOpen}
        onClose={() => setIsCompleteFollowUpOpen(false)}
        followUp={selectedFollowUp}
        onSuccess={loadLeadDetails}
      />

      <ChangeStageModal
        isOpen={isChangeStageOpen}
        onClose={() => setIsChangeStageOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
        onOpenLostModal={() => setIsMarkLostOpen(true)}
      />

      <MarkLostModal
        isOpen={isMarkLostOpen}
        onClose={() => setIsMarkLostOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
      />

      <AssignLeadModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
      />
    </div>
  )
}
