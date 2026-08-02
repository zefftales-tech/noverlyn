import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { LoadingState } from '../../components/ui/LoadingState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import { communicationsApi, type LeadCommunication } from '../../lib/communicationsApi'
import { normalizePhoneNumber, generateWhatsAppUrl } from '../../lib/whatsapp'
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
import { LogCommunicationModal } from '../../components/communications/LogCommunicationModal'
import { TemplateManagementModal } from '../../components/communications/TemplateManagementModal'

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
  Archive,
  Trash2,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Sparkles,
  ExternalLink,
  CheckCheck
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
  const [communications, setCommunications] = useState<LeadCommunication[]>([])
  const [membersMap, setMembersMap] = useState<Record<string, string>>({})
  const [leadAttention, setLeadAttention] = useState<AttentionItem | null>(null)

  const [activeTab, setActiveTab] = useState<'whatsapp' | 'timeline' | 'followups' | 'notes' | 'details'>('whatsapp')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add Note state
  const [newNoteContent, setNewNoteContent] = useState('')
  const [noteSubmitting, setNoteSubmitting] = useState(false)

  // WhatsApp Timeline Search & Sort
  const [waSearch, setWaSearch] = useState('')
  const [waSort, setWaSort] = useState<'newest' | 'oldest'>('newest')

  // Modals state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isLogContactOpen, setIsLogContactOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [isChangeStageOpen, setIsChangeStageOpen] = useState(false)
  const [isMarkLostOpen, setIsMarkLostOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [isCompleteFollowUpOpen, setIsCompleteFollowUpOpen] = useState(false)

  // WhatsApp Modals
  const [isLogWhatsAppOpen, setIsLogWhatsAppOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [whatsappDirection, setWhatsappDirection] = useState<'incoming' | 'outgoing'>('outgoing')

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

      // Fetch WhatsApp Communications
      const comms = await communicationsApi.getLeadCommunications(leadId)
      setCommunications(comms)

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

  const handleToggleCommunicationStatus = async () => {
    if (!lead) return
    const newStatus = (lead as unknown as { communication_status?: string }).communication_status === 'resolved' ? 'needs_response' : 'resolved'
    try {
      await communicationsApi.updateCommunicationStatus(lead.id, newStatus)
      await loadLeadDetails()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update communication status')
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

  const nextFollowUp = followUps
    .filter((f) => f.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]

  const isOverdue = nextFollowUp && new Date(nextFollowUp.scheduled_at) < new Date()
  const phoneParsed = normalizePhoneNumber(lead.phone)
  const leadCommStatus = (lead as unknown as { communication_status?: string }).communication_status || 'none'

  const formatActivityText = (act: Activity) => {
    const meta = ((act as unknown as { activity_data?: Record<string, unknown>; metadata?: Record<string, unknown> }).activity_data ||
      (act as unknown as { metadata?: Record<string, unknown> }).metadata ||
      {}) as Record<string, unknown>

    switch (act.activity_type) {
      case 'lead_created':
        return `Created lead record (Source: ${lead.source || 'Manual'})`
      case 'whatsapp_incoming_logged':
        return `Logged INCOMING WhatsApp message from ${lead.full_name}`
      case 'whatsapp_outgoing_logged':
        return `Logged OUTGOING WhatsApp message to ${lead.full_name}`
      case 'communication_status_changed':
        return `Changed WhatsApp communication status to ${String(meta.to_status || 'UPDATED').toUpperCase()}`
      case 'contact_logged':
        return `Logged contact interaction (${String(meta.channel || 'call').toUpperCase()})`
      case 'follow_up_scheduled':
        return `Scheduled follow-up for ${meta.scheduled_at ? new Date(String(meta.scheduled_at)).toLocaleString() : 'scheduled date'}`
      case 'follow_up_completed':
        return `Completed follow-up (${String(meta.outcome || 'Success')})`
      case 'follow_up_cancelled':
        return `Cancelled scheduled follow-up`
      case 'stage_changed':
        return `Changed pipeline stage from ${String(meta.from_stage || '').toUpperCase()} to ${String(meta.to_stage || '').toUpperCase()}`
      case 'deal_won':
        return `Marked lead as WON DEAL 🎉`
      case 'deal_lost':
        return `Marked lead as LOST — Reason: ${String(meta.lost_reason || '').toUpperCase()}`
      default:
        return `Activity: ${act.activity_type}`
    }
  }

  const filteredCommunications = communications
    .filter((c) => c.message.toLowerCase().includes(waSearch.toLowerCase()))
    .sort((a, b) => {
      const timeA = new Date(a.occurred_at).getTime()
      const timeB = new Date(b.occurred_at).getTime()
      return waSort === 'newest' ? timeB - timeA : timeA - timeB
    })

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto px-1 sm:px-2">
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

                {/* WhatsApp Status Badge */}
                <Badge
                  variant={
                    leadCommStatus === 'needs_response'
                      ? 'critical'
                      : leadCommStatus === 'awaiting_reply'
                      ? 'blue'
                      : leadCommStatus === 'resolved'
                      ? 'success'
                      : 'neutral'
                  }
                  className="uppercase font-bold"
                >
                  {leadCommStatus === 'needs_response'
                    ? 'NEEDS RESPONSE'
                    : leadCommStatus === 'awaiting_reply'
                    ? 'AWAITING REPLY'
                    : leadCommStatus === 'resolved'
                    ? 'RESOLVED'
                    : 'NO WHATSAPP'}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-content-secondary mt-1 flex-wrap min-w-0">
                <span className="flex items-center gap-1 font-semibold text-navy-900 shrink-0">
                  <Phone className="w-3.5 h-3.5 text-content-muted shrink-0" /> {lead.phone}
                </span>
                {lead.email && (
                  <span className="flex items-center gap-1 min-w-0 break-all">
                    <Mail className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <span className="break-all">{lead.email}</span>
                  </span>
                )}
                <span className="flex items-center gap-1 shrink-0">
                  <UserCheck className="w-3.5 h-3.5 text-content-muted shrink-0" /> Assigned:{' '}
                  <strong className="text-navy-900">
                    {lead.assigned_to ? membersMap[lead.assigned_to] || 'Agent' : 'Unassigned'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Header Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              href={phoneParsed.isValid ? generateWhatsAppUrl(lead.phone) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              size="sm"
              icon={<MessageSquare className="w-3.5 h-3.5 text-emerald-400" />}
              disabled={!phoneParsed.isValid}
              title={!phoneParsed.isValid ? 'Add a valid phone number with country code to open WhatsApp.' : undefined}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Open in WhatsApp
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={<ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={() => {
                setWhatsappDirection('outgoing')
                setIsLogWhatsAppOpen(true)
              }}
            >
              Log Message
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={<PhoneCall className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={() => setIsLogContactOpen(true)}
            >
              Log Call
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
                      try {
                        await leadsApi.archiveLead(lead.id)
                        navigate('/leads/archived')
                      } catch (err: unknown) {
                        alert(err instanceof Error ? err.message : 'Failed to archive lead')
                      }
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
                      try {
                        await leadsApi.softDeleteLead(lead.id, reason || undefined)
                        navigate('/leads/trash')
                      } catch (err: unknown) {
                        alert(err instanceof Error ? err.message : 'Failed to move lead to Trash')
                      }
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

      {/* NEXT ACTION BANNER */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          isOverdue
            ? 'bg-status-critical-bg border-red-200'
            : nextFollowUp
            ? 'bg-blue-50/70 border-blue-200'
            : 'bg-slate-50 border-surface-border'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0 ${
              isOverdue ? 'bg-status-critical' : nextFollowUp ? 'bg-brand-blue' : 'bg-slate-400'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-navy-900">
                {isOverdue ? 'OVERDUE FOLLOW-UP' : nextFollowUp ? 'NEXT SCHEDULED FOLLOW-UP' : 'NO SCHEDULED FOLLOW-UP'}
              </span>
              {nextFollowUp && (
                <span className="text-xs text-content-secondary">
                  ({new Date(nextFollowUp.scheduled_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })})
                </span>
              )}
            </div>
            <p className="text-xs text-content-secondary mt-0.5">
              {nextFollowUp
                ? `[${(nextFollowUp.type || 'TASK').toUpperCase()}] ${nextFollowUp.notes || 'Routine check-in'}`
                : 'Schedule a follow-up action to maintain sales momentum.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {nextFollowUp ? (
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={() => {
                setSelectedFollowUp(nextFollowUp)
                setIsCompleteFollowUpOpen(true)
              }}
            >
              Complete Action
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-4 h-4 text-brand-blue" />}
              onClick={() => setIsScheduleOpen(true)}
            >
              Schedule Action
            </Button>
          )}
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-6 border-b border-surface-border text-xs select-none overflow-x-auto pb-1">
        {[
          { key: 'whatsapp', label: `WhatsApp (${communications.length})` },
          { key: 'timeline', label: `Activity Timeline (${activities.length})` },
          { key: 'followups', label: `Follow-ups (${followUps.length})` },
          { key: 'notes', label: `Notes (${notes.length})` },
          { key: 'details', label: 'Lead Details' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`pb-3 border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-brand-blue text-brand-blue font-bold'
                : 'border-transparent text-content-secondary hover:text-navy-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: WHATSAPP COMMUNICATIONS */}
      {activeTab === 'whatsapp' && (
        <Card
          title="WhatsApp Communication & History"
          subtitle="Track, log, and send WhatsApp communications with full conversation context"
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                icon={<Sparkles className="w-3.5 h-3.5 text-brand-blue" />}
                onClick={() => setIsTemplatesOpen(true)}
              >
                Templates
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<ArrowDownLeft className="w-3.5 h-3.5 text-brand-blue" />}
                onClick={() => {
                  setWhatsappDirection('incoming')
                  setIsLogWhatsAppOpen(true)
                }}
              >
                Log Incoming
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<ArrowUpRight className="w-3.5 h-3.5" />}
                onClick={() => {
                  setWhatsappDirection('outgoing')
                  setIsLogWhatsAppOpen(true)
                }}
              >
                Log Outgoing
              </Button>
              <Button
                variant={leadCommStatus === 'resolved' ? 'outline' : 'secondary'}
                size="sm"
                icon={<CheckCheck className="w-3.5 h-3.5" />}
                onClick={handleToggleCommunicationStatus}
              >
                {leadCommStatus === 'resolved' ? 'Reopen Conversation' : 'Mark Resolved'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Search and Sort Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-content-muted" />
                <input
                  type="text"
                  placeholder="Search WhatsApp messages..."
                  value={waSearch}
                  onChange={(e) => setWaSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-surface-border text-xs text-navy-900 bg-white"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-content-secondary font-medium">Sort:</span>
                <select
                  value={waSort}
                  onChange={(e) => setWaSort(e.target.value as 'newest' | 'oldest')}
                  className="px-2.5 py-1.5 rounded-lg border border-surface-border text-xs text-navy-900 bg-white"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>

            {/* Communication Bubble Timeline */}
            {filteredCommunications.length === 0 ? (
              <EmptyState
                title="No WhatsApp communications logged yet"
                description="Contact this lead on WhatsApp or log incoming and outgoing messages to track response status."
                icon={<MessageSquare className="w-8 h-8 text-emerald-600" />}
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      href={phoneParsed.isValid ? generateWhatsAppUrl(lead.phone) : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="primary"
                      size="sm"
                      icon={<ExternalLink className="w-4 h-4" />}
                      disabled={!phoneParsed.isValid}
                      title={!phoneParsed.isValid ? 'Add a valid phone number with country code to open WhatsApp.' : undefined}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Open in WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Plus className="w-4 h-4 text-brand-blue" />}
                      onClick={() => setIsLogWhatsAppOpen(true)}
                    >
                      Log Message
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="space-y-3 pt-2">
                {filteredCommunications.map((c) => {
                  const isIncoming = c.direction === 'incoming'
                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-2xl border text-xs space-y-2 transition-all ${
                        isIncoming
                          ? 'bg-slate-50/90 border-blue-200/80 mr-4 sm:mr-12'
                          : 'bg-emerald-50/60 border-emerald-200/80 ml-4 sm:ml-12'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1 rounded-lg font-bold flex items-center gap-1 ${
                              isIncoming ? 'bg-blue-100 text-brand-blue' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {isIncoming ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                            {isIncoming ? 'INCOMING' : 'OUTGOING'}
                          </span>
                          <span className="font-semibold text-navy-900">
                            Logged by {membersMap[c.logged_by] || 'Agent'}
                          </span>
                        </div>
                        <span className="text-[11px] text-content-muted">
                          {new Date(c.occurred_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>

                      <p className="text-xs text-navy-900 bg-white p-3 rounded-xl border border-surface-border/60 whitespace-pre-wrap leading-relaxed">
                        {c.message}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      )}

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
        <Card title="Internal Lead Notes" subtitle="Collaborative notes, special instructions, and property requirements">
          <form onSubmit={handleAddNote} className="space-y-3 mb-6">
            <textarea
              rows={3}
              placeholder="Add an internal note or update about this lead..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="w-full p-3 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" type="submit" isLoading={noteSubmitting} icon={<Plus className="w-4 h-4" />}>
                Add Note
              </Button>
            </div>
          </form>

          {notes.length === 0 ? (
            <p className="text-xs text-content-muted text-center py-6">No internal notes added yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="p-4 bg-slate-50 border border-surface-border rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar name={note.author?.full_name || 'User'} size="sm" />
                      <span className="font-bold text-navy-900">{note.author?.full_name || 'Team Member'}</span>
                    </div>
                    <span className="text-[11px] text-content-muted">
                      {new Date(note.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="text-navy-900 whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: LEAD DETAILS */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Core Contact & Source Info">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary">Full Name</span>
                <span className="font-semibold text-navy-900">{lead.full_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary">Phone Number</span>
                <span className="font-semibold text-navy-900">{lead.phone}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary">Email Address</span>
                <span className="font-semibold text-navy-900">{lead.email || '—'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary">Lead Source</span>
                <span className="font-semibold text-navy-900">{lead.source || 'Direct Inbound'}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-content-secondary">Created Date</span>
                <span className="font-semibold text-navy-900">
                  {new Date(lead.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Requirements & Financials">
            <div className="space-y-3 text-xs">
              <div className="py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary block mb-1">Requirement / Preferences</span>
                <p className="font-semibold text-navy-900 bg-slate-50 p-2 rounded.lg">{lead.requirement || 'No preference specified'}</p>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary">Min Budget</span>
                <span className="font-semibold text-navy-900">
                  {lead.budget_min ? `${currentWorkspace?.currency || 'USD'} ${lead.budget_min.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border/50">
                <span className="text-content-secondary">Max Budget</span>
                <span className="font-semibold text-navy-900">
                  {lead.budget_max ? `${currentWorkspace?.currency || 'USD'} ${lead.budget_max.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-content-secondary">Estimated Deal Value</span>
                <span className="font-semibold text-emerald-600">
                  {lead.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${lead.estimated_value.toLocaleString()}` : '—'}
                </span>
              </div>
            </div>
          </Card>
        </div>
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
      {selectedFollowUp && (
        <CompleteFollowUpModal
          isOpen={isCompleteFollowUpOpen}
          onClose={() => {
            setIsCompleteFollowUpOpen(false)
            setSelectedFollowUp(null)
          }}
          followUp={selectedFollowUp}
          onSuccess={loadLeadDetails}
        />
      )}
      <ChangeStageModal
        isOpen={isChangeStageOpen}
        onClose={() => setIsChangeStageOpen(false)}
        lead={lead}
        onSuccess={loadLeadDetails}
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

      {/* WHATSAPP MODALS */}
      <LogCommunicationModal
        isOpen={isLogWhatsAppOpen}
        onClose={() => setIsLogWhatsAppOpen(false)}
        leadId={lead.id}
        leadName={lead.full_name}
        leadPhone={lead.phone}
        leadRequirement={lead.requirement || undefined}
        assignedAgentName={lead.assigned_to ? membersMap[lead.assigned_to] : undefined}
        nextFollowUpDate={nextFollowUp ? new Date(nextFollowUp.scheduled_at).toLocaleString() : undefined}
        initialDirection={whatsappDirection}
        onSuccess={loadLeadDetails}
      />

      <TemplateManagementModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
      />
    </div>
  )
}
