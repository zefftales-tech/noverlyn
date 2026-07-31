import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import type { Database, FollowUpType } from '../../types/database.types'
import { AlertCircle, Calendar, Clock } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface ScheduleFollowUpModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSuccess?: () => void
}

export const ScheduleFollowUpModal: React.FC<ScheduleFollowUpModalProps> = ({
  isOpen,
  onClose,
  lead,
  onSuccess,
}) => {
  const { currentWorkspace } = useWorkspace()

  const [scheduledAt, setScheduledAt] = useState('')
  const [type, setType] = useState<FollowUpType>('call')
  const [assignedTo, setAssignedTo] = useState('')
  const [notes, setNotes] = useState('')

  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (lead) {
      queueMicrotask(() => {
        setAssignedTo(lead.assigned_to || '')
      })
    }
  }, [lead])

  useEffect(() => {
    if (isOpen && currentWorkspace) {
      leadsApi.getWorkspaceMembers(currentWorkspace.id).then(setMembers)
    }
  }, [isOpen, currentWorkspace])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return
    if (!scheduledAt) {
      setError('Date and time are required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await leadsApi.scheduleFollowUp({
        lead_id: lead.id,
        scheduled_at: new Date(scheduledAt).toISOString(),
        type,
        assigned_to: assignedTo || undefined,
        notes: notes.trim() || undefined,
      })

      setScheduledAt('')
      setNotes('')
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to schedule follow-up'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const typeOptions = [
    { value: 'call', label: 'Phone Call' },
    { value: 'whatsapp', label: 'WhatsApp Message' },
    { value: 'email', label: 'Email Follow-up' },
    { value: 'meeting', label: 'In-person Meeting' },
    { value: 'viewing', label: 'Property Viewing' },
    { value: 'other', label: 'Other Task' },
  ]

  const memberOptions = [
    { value: '', label: 'Assigned Lead Agent (Default)' },
    ...members.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Follow-up Action"
      subtitle={`Set next scheduled task for ${lead?.full_name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Scheduled Date & Time *"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            leftIcon={<Calendar className="w-4 h-4" />}
            required
          />

          <Select
            label="Follow-up Type"
            options={typeOptions}
            value={type}
            onChange={(e) => setType(e.target.value as FollowUpType)}
          />
        </div>

        <Select
          label="Assigned Agent"
          options={memberOptions}
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        />

        <Input
          label="Follow-up Agenda / Notes"
          placeholder="e.g. Call to discuss updated price list for downtown project"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={loading} icon={<Clock className="w-4 h-4" />}>
            Schedule Action
          </Button>
        </div>
      </form>
    </Modal>
  )
}
