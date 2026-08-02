import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingState } from '../../components/ui/LoadingState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { formsApi, type PublicFormSubmission, type SubmissionStatus } from '../../lib/formsApi'
import { leadsApi, type PipelineStage } from '../../lib/leadsApi'
import {
  Inbox,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Trash2,
  RotateCcw,
  Search,
  UserCheck,
  Calendar,
  Phone,
  Mail,
  Building2,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  Eye,
  X,
  FileText,
  Lock
} from 'lucide-react'

export const ReviewInboxPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<SubmissionStatus>('pending')
  const [submissions, setSubmissions] = useState<PublicFormSubmission[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Drawer & Modals state
  const [selectedSubmission, setSelectedSubmission] = useState<PublicFormSubmission | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isApproveOpen, setIsApproveOpen] = useState(false)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  // Approve Form State
  const [assignedTo, setAssignedTo] = useState('')
  const [priority, setPriority] = useState('warm')
  const [selectedStage, setSelectedStage] = useState('')
  const [nextFollowUpDate, setNextFollowUpDate] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [approving, setApproving] = useState(false)

  // Workspace metadata for approval
  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([])
  const [stages, setStages] = useState<PipelineStage[]>([])

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const loadSubmissions = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const data = await formsApi.getSubmissions(currentWorkspace.id, activeTab)
      setSubmissions(data)

      const mems = await leadsApi.getWorkspaceMembers(currentWorkspace.id)
      setMembers(mems)

      const stgs = await leadsApi.getPipelineStages(currentWorkspace.id)
      setStages(stgs)
      if (stgs.length > 0) {
        setSelectedStage(stgs[0].stage_key)
      }
    } catch (err: unknown) {
      console.error('Error loading form submissions:', err)
      const msg = err instanceof Error ? err.message : 'Failed to load form submissions'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, activeTab])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadSubmissions()
    })
  }, [loadSubmissions])

  const handleOpenApproveModal = (sub: PublicFormSubmission) => {
    setSelectedSubmission(sub)
    setAssignedTo('')
    setPriority('warm')
    setInternalNote('')
    setNextFollowUpDate('')
    setIsApproveOpen(true)
  }

  const handleExecuteApproval = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSubmission) return

    setApproving(true)
    try {
      const res = await formsApi.approveSubmission({
        submission_id: selectedSubmission.id,
        assigned_to: assignedTo || undefined,
        priority,
        stage_key: selectedStage || undefined,
        next_follow_up_at: nextFollowUpDate ? new Date(nextFollowUpDate).toISOString() : undefined,
        internal_note: internalNote.trim() || undefined,
      })

      if (res.success) {
        setIsApproveOpen(false)
        setIsDetailOpen(false)
        await loadSubmissions()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve submission')
    } finally {
      setApproving(false)
    }
  }

  const handleProcessStatus = async (subId: string, status: SubmissionStatus, reason?: string) => {
    const success = await formsApi.processSubmissionStatus(subId, status, reason)
    if (success) {
      setIsRejectOpen(false)
      setIsDetailOpen(false)
      await loadSubmissions()
    }
  }

  const handlePermanentDelete = async (subId: string) => {
    if (!confirm('Permanently delete this submission? This cannot be undone.')) return
    const success = await formsApi.permanentlyDeleteSubmission(subId)
    if (success) {
      setIsDetailOpen(false)
      await loadSubmissions()
    }
  }

  const filteredSubmissions = submissions.filter((s) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q))
    )
  })

  if (!isOwnerOrManager) {
    return (
      <Card>
        <div className="py-12 text-center space-y-3">
          <Lock className="w-8 h-8 text-content-muted mx-auto" />
          <h3 className="font-heading font-bold text-lg text-navy-900">Manager Access Required</h3>
          <p className="text-xs text-content-secondary max-w-md mx-auto">
            Only Workspace Owners and Managers can access the Form Submission Review Inbox.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="pb-3 border-b border-surface-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight flex items-center gap-2.5">
            <Inbox className="w-7 h-7 text-brand-blue" />
            Form Submission Review
          </h1>
          <p className="text-sm text-content-secondary mt-1">
            Review public inquiry submissions before creating active leads in your workspace.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder="Search by name, phone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-content-muted" />}
          />
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-surface-border flex gap-4 text-xs font-bold select-none overflow-x-auto">
        {[
          { key: 'pending', label: 'Pending Review' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'spam', label: 'Spam' },
          { key: 'deleted', label: 'Deleted' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as SubmissionStatus)}
            className={`pb-3 border-b-2 transition-all whitespace-nowrap px-1 ${
              activeTab === tab.key
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-content-secondary hover:text-navy-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Submissions List */}
      {loading ? (
        <Card><LoadingState label="Loading form submissions..." /></Card>
      ) : error ? (
        <Card>
          <div className="p-4 bg-red-50 text-status-critical text-xs rounded-xl">{error}</div>
        </Card>
      ) : filteredSubmissions.length === 0 ? (
        <Card>
          <EmptyState
            title={`No ${activeTab} submissions`}
            description="Submissions received via public forms will appear here for review."
            icon={<Inbox className="w-8 h-8 text-brand-blue" />}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((sub) => (
            <div
              key={sub.id}
              className="bg-white border border-surface-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-saas transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group"
            >
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-bold text-base text-navy-900">{sub.full_name}</span>
                  <Badge variant={sub.status === 'approved' ? 'success' : sub.status === 'pending' ? 'warning' : 'neutral'}>
                    {sub.status.toUpperCase()}
                  </Badge>
                  {sub.possible_duplicate && (
                    <Badge variant="critical" className="flex items-center gap-1 font-bold">
                      <AlertTriangle className="w-3 h-3" /> POSSIBLE DUPLICATE
                    </Badge>
                  )}
                  <span className="text-[11px] text-content-secondary flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-content-muted" />
                    {new Date(sub.submitted_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-content-secondary flex-wrap min-w-0">
                  <span className="flex items-center gap-1 font-semibold text-navy-900 shrink-0">
                    <Phone className="w-3.5 h-3.5 text-content-muted shrink-0" /> {sub.phone}
                  </span>
                  {sub.email && (
                    <span className="flex items-center gap-1 min-w-0 break-all">
                      <Mail className="w-3.5 h-3.5 text-content-muted shrink-0" />
                      <span className="break-all">{sub.email}</span>
                    </span>
                  )}
                  {sub.budget && (
                    <span className="flex items-center gap-1 font-semibold text-emerald-600">
                      <DollarSign className="w-3.5 h-3.5" /> {sub.budget.toLocaleString()}
                    </span>
                  )}
                  {sub.source_detail && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-content-muted" /> Channel: {sub.source_detail}
                    </span>
                  )}
                </div>

                <p className="text-xs text-navy-900 bg-slate-50 p-2.5 rounded-xl border border-surface-border/50 line-clamp-2 italic">
                  "{sub.requirement}"
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap pt-2 md:pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedSubmission(sub)
                    setIsDetailOpen(true)
                  }}
                  icon={<Eye className="w-3.5 h-3.5" />}
                >
                  View Details
                </Button>

                {sub.status === 'pending' && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenApproveModal(sub)}
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    >
                      Approve & Create Lead
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSubmission(sub)
                        setRejectionReason('')
                        setIsRejectOpen(true)
                      }}
                      icon={<XCircle className="w-3.5 h-3.5 text-status-critical" />}
                    >
                      Reject
                    </Button>
                  </>
                )}

                {sub.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleProcessStatus(sub.id, 'spam')}
                    icon={<AlertOctagon className="w-3.5 h-3.5 text-amber-600" />}
                    title="Mark as Spam"
                  >
                    Spam
                  </Button>
                )}

                {(sub.status === 'rejected' || sub.status === 'spam' || sub.status === 'deleted') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleProcessStatus(sub.id, 'pending')}
                    icon={<RotateCcw className="w-3.5 h-3.5 text-brand-blue" />}
                  >
                    Restore to Pending
                  </Button>
                )}

                {currentRole === 'owner' && sub.status === 'deleted' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handlePermanentDelete(sub.id)}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Permanently Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APPROVE MODAL */}
      {isApproveOpen && selectedSubmission && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
          <div className="bg-white border border-surface-border rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 pb-safe">
            <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between shrink-0 bg-white">
              <h3 className="font-heading font-bold text-base text-navy-900 truncate">
                Approve & Create Lead — {selectedSubmission.full_name}
              </h3>
              <button onClick={() => setIsApproveOpen(false)} className="text-slate-400 hover:text-navy-900 p-1 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteApproval} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">Assign Agent (Optional)</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-surface-border text-xs text-navy-900 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.fullName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-surface-border text-xs text-navy-900 bg-white"
                  >
                    <option value="hot">HOT (High Urgency)</option>
                    <option value="warm">WARM (Normal)</option>
                    <option value="cold">COLD (Low Priority)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">Initial Pipeline Stage</label>
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-surface-border text-xs text-navy-900 bg-white"
                  >
                    {stages.map((stg) => (
                      <option key={stg.stage_key} value={stg.stage_key}>{stg.label}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="First Scheduled Follow-up Date (Optional)"
                  type="datetime-local"
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                />

                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">Internal Note (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Verified phone number. Prefers morning contact."
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-surface-border flex justify-end gap-2 shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsApproveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={approving} icon={<CheckCircle2 className="w-4 h-4" />}>
                  {approving ? 'Creating Lead...' : 'Approve & Create Lead'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {isRejectOpen && selectedSubmission && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-surface-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-heading font-bold text-base text-navy-900">
              Reject Submission — {selectedSubmission.full_name}
            </h3>
            <p className="text-xs text-content-secondary">
              Rejected submissions will not create active leads in your workspace.
            </p>

            <textarea
              rows={3}
              placeholder="Reason for rejection (Optional)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleProcessStatus(selectedSubmission.id, 'rejected', rejectionReason)}
              >
                Reject Submission
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMISSION DETAIL DRAWER */}
      {isDetailOpen && selectedSubmission && (
        <div className="fixed inset-0 z-[130] bg-navy-900/50 backdrop-blur-xs flex justify-end">
          <div className="bg-white max-w-lg w-full h-full shadow-2xl p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
              <h3 className="font-heading font-bold text-lg text-navy-900">Submission Details</h3>
              <button onClick={() => setIsDetailOpen(false)} className="text-slate-400 hover:text-navy-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contact Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Contact Information
              </h4>
              <div className="p-3 bg-slate-50 border border-surface-border rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-content-secondary">Name:</span>
                  <span className="font-bold text-navy-900">{selectedSubmission.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-secondary">Phone:</span>
                  <span className="font-semibold text-navy-900">{selectedSubmission.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-secondary">Email:</span>
                  <span className="font-medium text-navy-900">{selectedSubmission.email || '—'}</span>
                </div>
              </div>
            </div>

            {/* Inquiry Details */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Inquiry Details
              </h4>
              <div className="p-3 bg-slate-50 border border-surface-border rounded-xl space-y-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-content-secondary block">Requirement / Message</span>
                  <p className="font-medium text-navy-900 mt-0.5 leading-relaxed">{selectedSubmission.requirement}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-surface-border/50">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-content-secondary block">Channel Detail</span>
                    <span className="font-medium text-navy-900">{selectedSubmission.source_detail || 'Direct'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-content-secondary block">Submitted Date</span>
                    <span className="font-medium text-navy-900">{new Date(selectedSubmission.submitted_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Answers */}
            {selectedSubmission.custom_answers && Object.keys(selectedSubmission.custom_answers).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Custom Question Answers
                </h4>
                <div className="space-y-2 text-xs">
                  {Object.entries(selectedSubmission.custom_answers).map(([key, item]) => (
                    <div key={key} className="p-3 bg-white border border-surface-border rounded-xl space-y-1">
                      <span className="text-[11px] font-bold text-content-secondary block">{item.label || key}</span>
                      <span className="font-medium text-navy-900 block">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions in Drawer */}
            <div className="pt-4 border-t border-surface-border flex flex-col gap-2">
              {selectedSubmission.status === 'pending' && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleOpenApproveModal(selectedSubmission)}
                  icon={<ArrowRight className="w-4 h-4" />}
                  className="w-full justify-center font-bold"
                >
                  Approve & Create Lead
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
