import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import type { Database } from '../../types/database.types'
import { AlertCircle, UserCheck } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface AssignLeadModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSuccess?: () => void
}

export const AssignLeadModal: React.FC<AssignLeadModalProps> = ({ isOpen, onClose, lead, onSuccess }) => {
  const { currentWorkspace } = useWorkspace()

  const [assignedTo, setAssignedTo] = useState('')
  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (lead) {
      Promise.resolve().then(() => {
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

    setLoading(true)
    setError(null)

    try {
      await leadsApi.assignLead(lead.id, assignedTo || null)
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to assign lead'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const memberOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Lead to Agent"
      subtitle={`Selecting responsible sales agent for ${lead?.full_name}`}
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
          label="Select Active Workspace Agent *"
          options={memberOptions}
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        />

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={loading} icon={<UserCheck className="w-4 h-4" />}>
            Save Assignment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
