import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { leadsApi } from '../../lib/leadsApi'
import type { Database, LeadStage } from '../../types/database.types'
import { AlertCircle, GitPullRequest } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface ChangeStageModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSuccess?: () => void
  onOpenLostModal?: () => void
}

export const ChangeStageModal: React.FC<ChangeStageModalProps> = ({
  isOpen,
  onClose,
  lead,
  onSuccess,
  onOpenLostModal,
}) => {
  const [selectedStage, setSelectedStage] = useState<LeadStage>('new')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (lead) {
      Promise.resolve().then(() => {
        setSelectedStage(lead.stage || 'new')
      })
    }
  }, [lead])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return

    if (selectedStage === 'lost') {
      onClose()
      if (onOpenLostModal) onOpenLostModal()
      return
    }

    setLoading(true)
    setError(null)

    try {
      await leadsApi.changeStage(lead.id, selectedStage)
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to change stage'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const stageOptions = [
    { value: 'new', label: 'New Lead' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified Requirement' },
    { value: 'property_shared', label: 'Property Shared' },
    { value: 'viewing_scheduled', label: 'Viewing Scheduled' },
    { value: 'negotiation', label: 'Negotiation / Offer' },
    { value: 'won', label: 'WON Deal' },
    { value: 'lost', label: 'LOST Deal (Requires Reason)' },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Pipeline Stage"
      subtitle={`Updating pipeline deal stage for ${lead?.full_name}`}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Select
          label="New Pipeline Stage"
          options={stageOptions}
          value={selectedStage}
          onChange={(e) => setSelectedStage(e.target.value as LeadStage)}
        />

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={loading} icon={<GitPullRequest className="w-4 h-4" />}>
            Update Stage
          </Button>
        </div>
      </form>
    </Modal>
  )
}
