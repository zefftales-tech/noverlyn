import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { teamApi, type TeamMemberItem } from '../../lib/teamApi'
import { AlertTriangle, UserMinus } from 'lucide-react'

export interface RemoveMemberModalProps {
  isOpen: boolean
  onClose: () => void
  member: TeamMemberItem | null
  onSuccess: () => void
}

export const RemoveMemberModal: React.FC<RemoveMemberModalProps> = ({
  isOpen,
  onClose,
  member,
  onSuccess,
}) => {
  const { currentWorkspace } = useWorkspace()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!member) return null

  const handleRemove = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      await teamApi.removeMember(currentWorkspace.id, member.userId)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      console.error('[Error removing member]', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to remove member from workspace'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const hasActiveWork = member.activeLeadsCount > 0 || member.overdueCount > 0 || member.dueTodayCount > 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Remove member from workspace?"
      subtitle="This will permanently remove their access to this workspace. Historical lead and activity records will be preserved."
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-slate-50 border border-surface-border rounded-lg text-xs space-y-1">
          <span className="font-bold text-navy-900 block">{member.fullName}</span>
          <span className="text-content-secondary text-[11px]">Role: <strong className="uppercase">{member.role}</strong> • Email: {member.email}</span>
        </div>

        {hasActiveWork && (
          <div className="p-3.5 bg-status-warning-bg border border-amber-200 rounded-lg text-xs text-status-warning flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-1">
              <strong className="block font-bold text-amber-900">Active Work Assigned to Member!</strong>
              <p className="text-amber-950">
                {member.fullName} currently has <strong className="text-navy-900">{member.activeLeadsCount} active assigned leads</strong> and <strong className="text-navy-900">{member.overdueCount + member.dueTodayCount} open tasks</strong>. Removing this member will revoke their access immediately, but their assigned records will NOT be deleted. We strongly recommend reassigning their leads before removal.
              </p>
            </div>
          </div>
        )}

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleRemove}
            isLoading={loading}
            icon={<UserMinus className="w-4 h-4" />}
          >
            Remove from Workspace
          </Button>
        </div>
      </div>
    </Modal>
  )
}
