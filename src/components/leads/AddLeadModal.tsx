import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import type { LeadPriority, LeadStage, FollowUpType } from '../../types/database.types'
import { AlertCircle, User, Phone, Mail, DollarSign, FileText, Calendar, Plus } from 'lucide-react'

export interface AddLeadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const AddLeadModal: React.FC<AddLeadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentWorkspace } = useWorkspace()

  // Form State
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('Website')
  const [requirement, setRequirement] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [priority, setPriority] = useState<LeadPriority>('warm')
  const [stage, setStage] = useState<LeadStage>('new')
  const [assignedTo, setAssignedTo] = useState('')
  const [initialNote, setInitialNote] = useState('')

  // Schedule follow up in form
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpType, setFollowUpType] = useState<FollowUpType>('call')
  const [followUpNotes, setFollowUpNotes] = useState('')

  // Members list
  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && currentWorkspace) {
      leadsApi.getWorkspaceMembers(currentWorkspace.id).then(setMembers)
    }
  }, [isOpen, currentWorkspace])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace) return
    if (!fullName.trim() || !phone.trim()) {
      setError('Full name and phone number are required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await leadsApi.createLead({
        workspace_id: currentWorkspace.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        source: source || undefined,
        requirement: requirement.trim() || undefined,
        budget_min: budgetMin ? Number(budgetMin) : undefined,
        budget_max: budgetMax ? Number(budgetMax) : undefined,
        estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
        priority,
        stage,
        assigned_to: assignedTo || undefined,
        initial_note: initialNote.trim() || undefined,
        follow_up_scheduled_at: scheduleFollowUp && followUpDate ? new Date(followUpDate).toISOString() : undefined,
        follow_up_type: scheduleFollowUp ? followUpType : undefined,
        follow_up_notes: scheduleFollowUp ? followUpNotes.trim() || undefined : undefined,
      })

      // Reset form
      setFullName('')
      setPhone('')
      setEmail('')
      setRequirement('')
      setBudgetMin('')
      setBudgetMax('')
      setEstimatedValue('')
      setInitialNote('')
      setScheduleFollowUp(false)
      setFollowUpDate('')
      setFollowUpNotes('')
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create lead'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const sourceOptions = [
    { value: 'Website', label: 'Website Inbound' },
    { value: 'WhatsApp', label: 'WhatsApp Inquiry' },
    { value: 'Call', label: 'Phone Call / Direct' },
    { value: 'Referral', label: 'Client Referral' },
    { value: 'Portal', label: 'Property Portal (Zillow/Bayut)' },
    { value: 'Facebook', label: 'Facebook Lead Ad' },
    { value: 'Instagram', label: 'Instagram DM' },
    { value: 'Walk-in', label: 'Office Walk-in' },
    { value: 'Other', label: 'Other' },
  ]

  const priorityOptions = [
    { value: 'hot', label: 'HOT — Urgent Deal' },
    { value: 'warm', label: 'WARM — Standard Follow-up' },
    { value: 'cold', label: 'COLD — Long-term Nurture' },
  ]

  const stageOptions = [
    { value: 'new', label: 'New Lead' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified Requirement' },
    { value: 'property_shared', label: 'Property Shared' },
    { value: 'viewing_scheduled', label: 'Viewing Scheduled' },
    { value: 'negotiation', label: 'Negotiation / Offer' },
  ]

  const memberOptions = [
    { value: '', label: 'Unassigned (Assign Later)' },
    ...members.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  const modalFooter = (
    <>
      <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form="add-lead-form" isLoading={loading} icon={<Plus className="w-4 h-4" />}>
        Create Lead Record
      </Button>
    </>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Lead"
      subtitle={`Adding lead record to ${currentWorkspace?.name}`}
      maxWidth="lg"
      footer={modalFooter}
    >
      <form id="add-lead-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Full Name *"
            placeholder="e.g. Michael Thorne"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            leftIcon={<User className="w-4 h-4" />}
            required
          />

          <Input
            label="Phone Number *"
            placeholder="+1 (555) 234-5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            leftIcon={<Phone className="w-4 h-4" />}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="michael@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <Select
            label="Lead Source"
            options={sourceOptions}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>

        <Input
          label="Requirement / Property Preference"
          placeholder="e.g. 3 Bedroom Villa in Downtown, High floor prefered"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          leftIcon={<FileText className="w-4 h-4" />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label={`Min Budget (${currentWorkspace?.currency || 'USD'})`}
            type="number"
            placeholder="400000"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            leftIcon={<DollarSign className="w-4 h-4" />}
          />
          <Input
            label={`Max Budget (${currentWorkspace?.currency || 'USD'})`}
            type="number"
            placeholder="650000"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            leftIcon={<DollarSign className="w-4 h-4" />}
          />
          <Input
            label={`Est. Deal Value (${currentWorkspace?.currency || 'USD'})`}
            type="number"
            placeholder="500000"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            leftIcon={<DollarSign className="w-4 h-4" />}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Priority"
            options={priorityOptions}
            value={priority}
            onChange={(e) => setPriority(e.target.value as LeadPriority)}
          />

          <Select
            label="Initial Stage"
            options={stageOptions}
            value={stage}
            onChange={(e) => setStage(e.target.value as LeadStage)}
          />

          <Select
            label="Assigned Agent"
            options={memberOptions}
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          />
        </div>

        <Input
          label="Initial Note"
          placeholder="Add important context, special requests, or deal background..."
          value={initialNote}
          onChange={(e) => setInitialNote(e.target.value)}
        />

        {/* Optional Schedule Follow-up toggle */}
        <div className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-navy-900 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleFollowUp}
              onChange={(e) => setScheduleFollowUp(e.target.checked)}
              className="rounded border-surface-border text-brand-blue focus:ring-brand-blue"
            />
            <span>Schedule Initial Follow-up Immediately</span>
          </label>

          {scheduleFollowUp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Input
                label="Follow-up Date & Time *"
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                leftIcon={<Calendar className="w-4 h-4" />}
                required={scheduleFollowUp}
              />
              <Select
                label="Follow-up Type"
                options={[
                  { value: 'call', label: 'Phone Call' },
                  { value: 'whatsapp', label: 'WhatsApp Message' },
                  { value: 'email', label: 'Email' },
                  { value: 'meeting', label: 'In-person Meeting' },
                  { value: 'viewing', label: 'Property Viewing' },
                  { value: 'other', label: 'Other Action' },
                ]}
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}
              />
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
