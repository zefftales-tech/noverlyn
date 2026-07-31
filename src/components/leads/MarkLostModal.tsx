import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { leadsApi } from '../../lib/leadsApi'
import type { Database, LostReason } from '../../types/database.types'
import { AlertCircle, AlertTriangle } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface MarkLostModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSuccess?: () => void
}

export const MarkLostModal: React.FC<MarkLostModalProps> = ({ isOpen, onClose, lead, onSuccess }) => {
  const [lostReason, setLostReason] = useState<LostReason>('price')
  const [lostNotes, setLostNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return

    setLoading(true)
    setError(null)

    try {
      await leadsApi.markLost(lead.id, lostReason, lostNotes.trim() || undefined)
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to mark lead lost'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const reasonOptions = [
    { value: 'price', label: 'Price / Budget Mismatch' },
    { value: 'no_response', label: 'No Response / Unreachable' },
    { value: 'bought_elsewhere', label: 'Bought / Rented Elsewhere' },
    { value: 'location', label: 'Location Preference Unmet' },
    { value: 'financing', label: 'Financing / Mortgage Rejected' },
    { value: 'not_ready', label: 'Not Ready to Move / Delayed' },
    { value: 'other', label: 'Other Reason' },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark Lead as Lost"
      subtitle={`Identify root-cause loss reason for ${lead?.full_name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Recording the lost reason is mandatory to power Noverlyn Lost Lead Intelligence and identify deal leaks.
          </span>
        </div>

        <Select
          label="Root Cause Loss Reason *"
          options={reasonOptions}
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value as LostReason)}
        />

        <Input
          label="Loss Context & Notes"
          placeholder="e.g. Client purchased competitor 2BR in Marina for lower price point"
          value={lostNotes}
          onChange={(e) => setLostNotes(e.target.value)}
        />

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={loading} icon={<AlertTriangle className="w-4 h-4" />}>
            Confirm Deal Lost
          </Button>
        </div>
      </form>
    </Modal>
  )
}
