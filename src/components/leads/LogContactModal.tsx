import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { leadsApi } from '../../lib/leadsApi'
import type { Database, FollowUpType } from '../../types/database.types'
import { AlertCircle, PhoneCall, Calendar } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface LogContactModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSuccess?: () => void
}

export const LogContactModal: React.FC<LogContactModalProps> = ({ isOpen, onClose, lead, onSuccess }) => {
  const [contactMethod, setContactMethod] = useState('call')
  const [outcome, setOutcome] = useState('Interested / Requested Proposal')
  const [notes, setNotes] = useState('')

  // Optional follow-up
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpType, setFollowUpType] = useState<FollowUpType>('call')
  const [followUpNotes, setFollowUpNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return

    setLoading(true)
    setError(null)

    try {
      await leadsApi.logContact({
        lead_id: lead.id,
        contact_method: contactMethod,
        outcome: outcome.trim() || undefined,
        notes: notes.trim() || undefined,
        follow_up_scheduled_at: scheduleFollowUp && followUpDate ? new Date(followUpDate).toISOString() : undefined,
        follow_up_type: scheduleFollowUp ? followUpType : undefined,
        follow_up_notes: scheduleFollowUp ? followUpNotes.trim() || undefined : undefined,
      })

      // Reset
      setNotes('')
      setScheduleFollowUp(false)
      setFollowUpDate('')
      setFollowUpNotes('')
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to log contact'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const methodOptions = [
    { value: 'call', label: 'Phone Call' },
    { value: 'whatsapp', label: 'WhatsApp Message' },
    { value: 'email', label: 'Email Communication' },
    { value: 'meeting', label: 'In-person / Virtual Meeting' },
    { value: 'other', label: 'Other Channel' },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Client Contact"
      subtitle={`Record real-world communication with ${lead?.full_name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Select
          label="Contact Communication Channel *"
          options={methodOptions}
          value={contactMethod}
          onChange={(e) => setContactMethod(e.target.value)}
        />

        <Input
          label="Outcome Summary"
          placeholder="e.g. Discussed 3BR villa options, requested floor plan link"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />

        <Input
          label="Detailed Interaction Notes"
          placeholder="Add key highlights, client objections, or specific terms..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* Optional Schedule Follow-up */}
        <div className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-navy-900 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleFollowUp}
              onChange={(e) => setScheduleFollowUp(e.target.checked)}
              className="rounded border-surface-border text-brand-blue focus:ring-brand-blue"
            />
            <span>Schedule Next Action Immediately</span>
          </label>

          {scheduleFollowUp && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <Input
                label="Action Agenda / Instructions"
                placeholder="Send updated brochure and confirm viewing time"
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={loading} icon={<PhoneCall className="w-4 h-4" />}>
            Log Contact Record
          </Button>
        </div>
      </form>
    </Modal>
  )
}
