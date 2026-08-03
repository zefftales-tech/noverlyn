import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useWorkspace } from '../../hooks/useWorkspace'
import { whatsappInboxApi, type WhatsAppContactReview } from '../../lib/whatsappInboxApi'
import { leadsApi } from '../../lib/leadsApi'
import { teamApi, type TeamMemberItem } from '../../lib/teamApi'
import { formatPhoneNumber } from '../../lib/whatsapp'
import {
  UserCheck,
  UserPlus,
  Link2,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Search,
  ShieldCheck
} from 'lucide-react'

export const ContactReviewPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'linked' | 'rejected' | 'spam'>('pending')
  const [reviews, setReviews] = useState<WhatsAppContactReview[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create Lead Modal
  const [createReview, setCreateReview] = useState<WhatsAppContactReview | null>(null)
  const [leadName, setLeadName] = useState('')
  const [assignedAgent, setAssignedAgent] = useState<string>('')
  const [submittingLead, setSubmittingLead] = useState(false)

  // Link Lead Modal
  const [linkReview, setLinkReview] = useState<WhatsAppContactReview | null>(null)
  const [leadSearch, setLeadSearch] = useState('')
  const [matchingLeads, setMatchingLeads] = useState<Array<{ id: string; name: string; phone: string }>>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [submittingLink, setSubmittingLink] = useState(false)

  useEffect(() => {
    let isMounted = true
    if (currentWorkspace) {
      teamApi.getTeamMembers(currentWorkspace.id).then((m) => {
        if (isMounted) setTeamMembers(m)
      }).catch(console.error)
    }
    return () => { isMounted = false }
  }, [currentWorkspace])

  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(async () => {
      if (!currentWorkspace) return
      try {
        const data = await whatsappInboxApi.getContactReviews(currentWorkspace.id, statusTab)
        if (isMounted) setReviews(data)
      } catch (err) {
        console.error(err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }, 0)
    return () => { isMounted = false; clearTimeout(timer) }
  }, [currentWorkspace, statusTab])

  const handleOpenCreateModal = (rev: WhatsAppContactReview) => {
    setCreateReview(rev)
    setLeadName(rev.contact_name || formatPhoneNumber(rev.contact_phone))
    setAssignedAgent('')
    setError(null)
  }

  const handleCreateLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createReview || !currentWorkspace) return

    setSubmittingLead(true)
    setError(null)

    try {
      await whatsappInboxApi.createLeadFromReview({
        review_id: createReview.id,
        lead_name: leadName.trim(),
        assigned_to: assignedAgent || undefined,
      })

      setCreateReview(null)
      const data = await whatsappInboxApi.getContactReviews(currentWorkspace.id, statusTab)
      setReviews(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create lead from WhatsApp contact'
      setError(msg)
    } finally {
      setSubmittingLead(false)
    }
  }

  const handleOpenLinkModal = async (rev: WhatsAppContactReview) => {
    setLinkReview(rev)
    setSelectedLeadId(null)
    setLeadSearch('')
    setError(null)

    if (currentWorkspace) {
      const res = await leadsApi.getLeads(currentWorkspace.id)
      setMatchingLeads(res.data.map((l: { id: string; full_name: string; phone: string }) => ({ id: l.id, name: l.full_name, phone: l.phone })))
    }
  }

  const handleLinkLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkReview || !selectedLeadId || !currentWorkspace) return

    setSubmittingLink(true)
    setError(null)

    try {
      await whatsappInboxApi.linkReviewToLead(linkReview.id, selectedLeadId)
      setLinkReview(null)
      const data = await whatsappInboxApi.getContactReviews(currentWorkspace.id, statusTab)
      setReviews(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to link WhatsApp contact to lead'
      setError(msg)
    } finally {
      setSubmittingLink(false)
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/whatsapp/inbox" className="text-content-secondary hover:text-navy-900 text-xs flex items-center gap-1 font-medium">
              <ArrowLeft className="w-4 h-4" /> Back to WhatsApp Inbox
            </Link>
          </div>
          <h1 className="font-heading font-bold text-2xl text-navy-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-brand-blue" />
            Unknown Contact Reviews
          </h1>
          <p className="text-xs text-content-secondary mt-0.5">
            Review incoming WhatsApp numbers that do not match existing leads. Convert them to new leads or link them cleanly.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-border text-xs font-semibold overflow-x-auto pb-1">
        {[
          { key: 'pending', label: 'Pending Review' },
          { key: 'approved', label: 'Approved & Created' },
          { key: 'linked', label: 'Linked to Existing' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'spam', label: 'Spam' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key as never)}
            className={`px-4 py-2.5 rounded-t-xl border-b-2 font-medium transition-all whitespace-nowrap ${
              statusTab === tab.key
                ? 'border-brand-blue text-brand-blue bg-blue-50/50 font-bold'
                : 'border-transparent text-content-secondary hover:text-navy-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Review List Card */}
      <Card title={`WhatsApp Contact Reviews (${reviews.length})`} subtitle="Owner & Manager lead qualification workflow">
        {loading ? (
          <div className="py-12 text-center text-xs text-content-secondary">Loading contact reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="py-12 text-center text-xs text-content-muted space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-600" />
            <p className="font-bold text-navy-900">No {statusTab} contact reviews found.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {reviews.map((rev) => (
              <div key={rev.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-navy-900">
                      {rev.contact_name || formatPhoneNumber(rev.contact_phone)}
                    </span>
                    <Badge variant={rev.status === 'pending' ? 'warning' : 'neutral'} size="sm">
                      {rev.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-content-secondary font-mono">
                    Phone: {formatPhoneNumber(rev.contact_phone)} • Received: {new Date(rev.created_at).toLocaleString()}
                  </p>
                  {rev.conversation?.last_message_preview && (
                    <p className="text-xs text-navy-800 bg-slate-50 p-2 rounded-lg border border-surface-border/60 max-w-xl">
                      "{rev.conversation.last_message_preview}"
                    </p>
                  )}
                </div>

                {isOwnerOrManager && rev.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<UserPlus className="w-3.5 h-3.5" />}
                      onClick={() => handleOpenCreateModal(rev)}
                    >
                      Create Lead
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Link2 className="w-3.5 h-3.5" />}
                      onClick={() => handleOpenLinkModal(rev)}
                    >
                      Link to Lead
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* CREATE LEAD MODAL */}
      {createReview && (
        <Modal
          isOpen={Boolean(createReview)}
          onClose={() => setCreateReview(null)}
          title="Create Lead from WhatsApp Contact"
          subtitle={`Converting ${formatPhoneNumber(createReview.contact_phone)} into an active Lead`}
          maxWidth="md"
        >
          <form onSubmit={handleCreateLeadSubmit} className="space-y-4 text-xs">
            <Input
              label="Lead Name *"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              required
            />

            <Select
              label="Assign Lead Agent"
              options={[
                { value: '', label: 'Unassigned (Assign later)' },
                ...teamMembers.map((m) => ({ value: m.userId, label: m.fullName })),
              ]}
              value={assignedAgent}
              onChange={(e) => setAssignedAgent(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setCreateReview(null)} disabled={submittingLead}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={submittingLead} icon={<CheckCircle2 className="w-4 h-4" />}>
                Create & Link Lead
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* LINK LEAD MODAL */}
      {linkReview && (
        <Modal
          isOpen={Boolean(linkReview)}
          onClose={() => setLinkReview(null)}
          title="Link WhatsApp Contact to Existing Lead"
          subtitle={`Select an existing lead for ${formatPhoneNumber(linkReview.contact_phone)}`}
          maxWidth="md"
        >
          <form onSubmit={handleLinkLeadSubmit} className="space-y-4 text-xs">
            <Input
              placeholder="Filter leads by name or phone..."
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />

            <div className="max-h-60 overflow-y-auto border border-surface-border rounded-xl divide-y divide-surface-border">
              {matchingLeads
                .filter((l) => l.name.toLowerCase().includes(leadSearch.toLowerCase()) || l.phone.includes(leadSearch))
                .map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedLeadId(l.id)}
                    className={`w-full text-left p-3 flex items-center justify-between text-xs transition-colors ${
                      selectedLeadId === l.id ? 'bg-blue-50 font-bold border-l-4 border-l-brand-blue' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <span className="text-navy-900 block font-bold">{l.name}</span>
                      <span className="text-[11px] text-content-secondary font-mono">{formatPhoneNumber(l.phone)}</span>
                    </div>
                    {selectedLeadId === l.id && <CheckCircle2 className="w-4 h-4 text-brand-blue" />}
                  </button>
                ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setLinkReview(null)} disabled={submittingLink}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={submittingLink} disabled={!selectedLeadId} icon={<Link2 className="w-4 h-4" />}>
                Link to Selected Lead
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
