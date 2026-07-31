import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { leadsApi } from '../../lib/leadsApi'
import type { Database } from '../../types/database.types'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

type FollowUp = Database['public']['Tables']['follow_ups']['Row']

export interface CompleteFollowUpModalProps {
  isOpen: boolean
  onClose: () => void
  followUp: FollowUp | null
  onSuccess?: () => void
}

export const CompleteFollowUpModal: React.FC<CompleteFollowUpModalProps> = ({
  isOpen,
  onClose,
  followUp,
  onSuccess,
}) => {
  const [outcome, setOutcome] = useState('Call completed successfully')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!followUp) return

    setLoading(true)
    setError(null)

    try {
      await leadsApi.completeFollowUp(followUp.id, outcome.trim() || undefined, notes.trim() || undefined)
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to complete follow-up'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Follow-up Task"
      subtitle={`Marking follow-up scheduled for ${followUp ? new Date(followUp.scheduled_at).toLocaleString() : ''} as completed`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Follow-up Outcome *"
          placeholder="e.g. Client agreed to scheduled viewing on Friday"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          required
        />

        <Input
          label="Additional Completion Notes"
          placeholder="Add any specific details discussed..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={loading} icon={<CheckCircle2 className="w-4 h-4" />}>
            Mark Completed
          </Button>
        </div>
      </form>
    </Modal>
  )
}
