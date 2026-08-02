import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import type { Database, LeadPriority } from '../../types/database.types'
import { AlertCircle, User, Phone, Mail, DollarSign, FileText, Check } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface EditLeadModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSuccess?: () => void
}

export const EditLeadModal: React.FC<EditLeadModalProps> = ({ isOpen, onClose, lead, onSuccess }) => {
  const { currentWorkspace } = useWorkspace()

  // Form State initialized directly from lead if provided
  const [fullName, setFullName] = useState(lead?.full_name || '')
  const [phone, setPhone] = useState(lead?.phone || '')
  const [email, setEmail] = useState(lead?.email || '')
  const [source, setSource] = useState(lead?.source || 'Website')
  const [requirement, setRequirement] = useState(lead?.requirement || '')
  const [budgetMin, setBudgetMin] = useState(lead?.budget_min ? String(lead.budget_min) : '')
  const [budgetMax, setBudgetMax] = useState(lead?.budget_max ? String(lead.budget_max) : '')
  const [estimatedValue, setEstimatedValue] = useState(lead?.estimated_value ? String(lead.estimated_value) : '')
  const [priority, setPriority] = useState<LeadPriority>(lead?.priority || 'warm')
  const [assignedTo, setAssignedTo] = useState(lead?.assigned_to || '')

  // Members list
  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && currentWorkspace) {
      leadsApi.getWorkspaceMembers(currentWorkspace.id).then(setMembers)
    }
  }, [isOpen, currentWorkspace])

  // Sync state when lead changes via async microtask tick to avoid synchronous effect cascading render
  useEffect(() => {
    if (!lead) return
    const timer = setTimeout(() => {
      setFullName(lead.full_name || '')
      setPhone(lead.phone || '')
      setEmail(lead.email || '')
      setSource(lead.source || 'Website')
      setRequirement(lead.requirement || '')
      setBudgetMin(lead.budget_min ? String(lead.budget_min) : '')
      setBudgetMax(lead.budget_max ? String(lead.budget_max) : '')
      setEstimatedValue(lead.estimated_value ? String(lead.estimated_value) : '')
      setPriority(lead.priority || 'warm')
      setAssignedTo(lead.assigned_to || '')
    }, 0)
    return () => clearTimeout(timer)
  }, [lead])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return
    if (!fullName.trim() || !phone.trim()) {
      setError('Full name and phone number are required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await leadsApi.updateLead({
        lead_id: lead.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        source: source || undefined,
        requirement: requirement.trim() || undefined,
        budget_min: budgetMin ? Number(budgetMin) : undefined,
        budget_max: budgetMax ? Number(budgetMax) : undefined,
        estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
        priority,
        assigned_to: assignedTo || undefined,
      })

      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update lead'
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

  const memberOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  const modalFooter = (
    <>
      <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form="edit-lead-form" isLoading={loading} icon={<Check className="w-4 h-4" />}>
        Save Lead Changes
      </Button>
    </>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Lead Information"
      subtitle={`Updating record for ${lead?.full_name}`}
      maxWidth="lg"
      footer={modalFooter}
    >
      <form id="edit-lead-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Full Name *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            leftIcon={<User className="w-4 h-4" />}
            required
          />

          <Input
            label="Phone Number *"
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
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          leftIcon={<FileText className="w-4 h-4" />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label={`Min Budget (${currentWorkspace?.currency || 'USD'})`}
            type="number"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            leftIcon={<DollarSign className="w-4 h-4" />}
          />
          <Input
            label={`Max Budget (${currentWorkspace?.currency || 'USD'})`}
            type="number"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            leftIcon={<DollarSign className="w-4 h-4" />}
          />
          <Input
            label={`Est. Deal Value (${currentWorkspace?.currency || 'USD'})`}
            type="number"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            leftIcon={<DollarSign className="w-4 h-4" />}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Priority"
            options={priorityOptions}
            value={priority}
            onChange={(e) => setPriority(e.target.value as LeadPriority)}
          />

          <Select
            label="Assigned Agent"
            options={memberOptions}
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
