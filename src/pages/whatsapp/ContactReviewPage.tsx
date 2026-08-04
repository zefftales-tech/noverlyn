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
  UserPlus,
  Link2,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  HelpCircle,
} from 'lucide-react'
import { aiIntelligenceApi } from '../../lib/aiIntelligenceApi'

export const ContactReviewPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'linked' | 'rejected' | 'spam'>('pending')
  const [reviews, setReviews] = useState<WhatsAppContactReview[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create Lead Modal State
  const [createReview, setCreateReview] = useState<WhatsAppContactReview | null>(null)
  const [leadName, setLeadName] = useState('')
  const [requirement, setRequirement] = useState('')
  const [budgetMin, setBudgetMin] = useState<string>('')
  const [budgetMax, setBudgetMax] = useState<string>('')
  const [stage, setStage] = useState('new')
  const [priority, setPriority] = useState('warm')
  const [assignedAgent, setAssignedAgent] = useState<string>('')
  const [initialNote, setInitialNote] = useState('')
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, unknown>>({})
  const [missingInfoList, setMissingInfoList] = useState<string[]>([])
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [selectedSugIds, setSelectedSugIds] = useState<string[]>([])
  const [analyzingModal, setAnalyzingModal] = useState(false)
  const [submittingLead, setSubmittingLead] = useState(false)

  // Link Lead Modal State
  const [linkReview, setLinkReview] = useState<WhatsAppContactReview | null>(null)
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

  const handleOpenCreateModal = async (rev: WhatsAppContactReview) => {
    setCreateReview(rev)
    setLeadName(rev.contact_name || formatPhoneNumber(rev.contact_phone))
    setRequirement('')
    setBudgetMin('')
    setBudgetMax('')
    setStage('new')
    setPriority('warm')
    setAssignedAgent('')
    setInitialNote('')
    setCustomFieldsData({})
    setMissingInfoList([])
    setAnalysisId(null)
    setSelectedSugIds([])
    setError(null)

    if (currentWorkspace) {
      setAnalyzingModal(true)
      try {
        const result = await aiIntelligenceApi.analyzeConversation({
          workspace_id: currentWorkspace.id,
          conversation_id: rev.conversation_id,
          trigger_type: 'lead_review',
        })
        const ana = result.analysis
        setAnalysisId(ana.id)
        if (ana.requirement_summary) setRequirement(ana.requirement_summary)
        if (ana.lead_temperature) setPriority(ana.lead_temperature === 'hot' ? 'hot' : ana.lead_temperature === 'cold' ? 'cold' : 'warm')
        if (ana.missing_information && Array.isArray(ana.missing_information)) {
          setMissingInfoList(ana.missing_information)
        }
        setSelectedSugIds(result.suggestions.filter((s) => s.status === 'pending').map((s) => s.id))

        // Pre-fill extracted fields
        const customObj: Record<string, unknown> = {}
        result.suggestions.forEach((sug) => {
          if (sug.suggestion_type === 'lead_field') {
            if (sug.target_field === 'full_name' && sug.suggested_value) {
              setLeadName(String(sug.suggested_value))
            } else if (sug.target_field === 'requirement' && sug.suggested_value) {
              setRequirement(String(sug.suggested_value))
            } else if (sug.target_field === 'budget_max' && typeof sug.suggested_value === 'number') {
              setBudgetMax(String(sug.suggested_value))
            } else if (sug.target_field === 'budget_min' && typeof sug.suggested_value === 'number') {
              setBudgetMin(String(sug.suggested_value))
            }
          } else if (sug.suggestion_type === 'custom_field' && sug.target_field) {
            customObj[sug.target_field] = sug.suggested_value
          }
        })
        setCustomFieldsData(customObj)
      } catch (err) {
        console.error('AI Auto-fill in modal error:', err)
      } finally {
        setAnalyzingModal(false)
      }
    }
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
        stage,
        priority,
        initial_note: initialNote.trim() || undefined,
        requirement: requirement.trim() || undefined,
        budget_min: budgetMin ? parseFloat(budgetMin) : undefined,
        budget_max: budgetMax ? parseFloat(budgetMax) : undefined,
        public_form_data: customFieldsData,
        analysis_id: analysisId || undefined,
        approved_suggestion_ids: selectedSugIds,
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
            WhatsApp Contact Reviews
          </h1>
          <p className="text-xs text-content-secondary mt-0.5">
            Review inbound WhatsApp conversations, verify customer details, and convert into structured Leads.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-border">
        {[
          { key: 'pending', label: 'Pending Review' },
          { key: 'approved', label: 'Approved (Leads Created)' },
          { key: 'linked', label: 'Linked to Existing' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'spam', label: 'Spam' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key as typeof statusTab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-all ${
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

      {/* CREATE LEAD MODAL WITH AI PRE-FILL */}
      {createReview && (
        <Modal
          isOpen={Boolean(createReview)}
          onClose={() => setCreateReview(null)}
          title="Create Lead from WhatsApp Contact"
          subtitle={`Converting ${formatPhoneNumber(createReview.contact_phone)} into a structured Lead`}
          maxWidth="lg"
        >
          <form onSubmit={handleCreateLeadSubmit} className="space-y-4 text-xs max-h-[80vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-100">
              <div className="flex items-center space-x-2 text-indigo-900">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="font-bold">AI Intelligence Pre-fill & Qualification</span>
              </div>
              {analyzingModal && <span className="text-[11px] text-indigo-600 font-medium animate-pulse">Analyzing...</span>}
            </div>

            {/* Standard Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Lead Full Name *"
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

              <div className="col-span-2">
                <Input
                  label="Requirement Summary"
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  placeholder="e.g. Needs 3BHK apartment in city center"
                />
              </div>

              <Input
                label="Min Budget"
                type="number"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="e.g. 10000"
              />

              <Input
                label="Max Budget"
                type="number"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="e.g. 50000"
              />

              <Select
                label="Stage"
                options={[
                  { value: 'new', label: 'New' },
                  { value: 'contacted', label: 'Contacted' },
                  { value: 'qualified', label: 'Qualified' },
                  { value: 'property_shared', label: 'Property / Proposal Shared' },
                  { value: 'viewing_scheduled', label: 'Viewing / Meeting Scheduled' },
                  { value: 'negotiation', label: 'Negotiation' },
                ]}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              />

              <Select
                label="Priority / Temperature"
                options={[
                  { value: 'hot', label: '🔥 Hot' },
                  { value: 'warm', label: '☀️ Warm' },
                  { value: 'cold', label: '❄️ Cold' },
                ]}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>

            {/* Custom Fields Extracted */}
            {Object.keys(customFieldsData).length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 text-xs block">AI Extracted Custom Fields</span>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(customFieldsData).map(([key, val]) => (
                    <div key={key} className="p-2 rounded bg-white border border-slate-200 text-xs">
                      <span className="text-slate-500 block text-[10px] uppercase font-mono">{key}</span>
                      <span className="font-semibold text-slate-900">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Details Warning Badges */}
            {missingInfoList.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                <span className="font-bold text-amber-900 text-xs flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600" /> Missing Qualification Details
                </span>
                <div className="flex flex-wrap gap-1">
                  {missingInfoList.map((item, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                      • {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Initial Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Note / Instructions</label>
              <textarea
                rows={2}
                value={initialNote}
                onChange={(e) => setInitialNote(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-brand-blue"
                placeholder="Internal notes for assigned agent..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
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
          subtitle={`Connecting ${formatPhoneNumber(linkReview.contact_phone)} to an existing CRM Lead`}
          maxWidth="md"
        >
          <form onSubmit={handleLinkLeadSubmit} className="space-y-4 text-xs">
            <Select
              label="Select Existing Lead *"
              options={[
                { value: '', label: '-- Select Lead --' },
                ...matchingLeads.map((l) => ({ value: l.id, label: `${l.name} (${l.phone || 'No phone'})` })),
              ]}
              value={selectedLeadId || ''}
              onChange={(e) => setSelectedLeadId(e.target.value || null)}
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setLinkReview(null)} disabled={submittingLink}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={submittingLink} disabled={!selectedLeadId} icon={<CheckCircle2 className="w-4 h-4" />}>
                Link Contact
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
