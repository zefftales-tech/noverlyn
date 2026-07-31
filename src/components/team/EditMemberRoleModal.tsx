import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { teamApi, type TeamMemberItem } from '../../lib/teamApi'
import type { WorkspaceRole, MemberStatus } from '../../types/database.types'
import { AlertTriangle } from 'lucide-react'

export interface EditMemberRoleModalProps {
  isOpen: boolean
  onClose: () => void
  member: TeamMemberItem | null
  onSuccess: () => void
}

export const EditMemberRoleModal: React.FC<EditMemberRoleModalProps> = ({
  isOpen,
  onClose,
  member,
  onSuccess,
}) => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [role, setRole] = useState<WorkspaceRole>('agent')
  const [status, setStatus] = useState<MemberStatus>('active')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOwner = currentRole === 'owner'

  React.useEffect(() => {
    if (member) {
      Promise.resolve().then(() => {
        setRole(member.role)
        setStatus(member.status)
      })
    }
  }, [member])

  if (!member) return null

  const handleRoleChange = async () => {
    if (!currentWorkspace || !isOwner) return
    setLoading(true)
    setError(null)

    try {
      if (role !== member.role) {
        await teamApi.updateMemberRole(currentWorkspace.id, member.userId, role)
      }
      if (status !== member.status) {
        await teamApi.setMemberStatus(currentWorkspace.id, member.userId, status)
      }
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update team member'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const roleOptions = [
    { value: 'agent', label: 'Sales Agent' },
    { value: 'manager', label: 'Operations Manager' },
  ]

  const statusOptions = [
    { value: 'active', label: 'Active Member' },
    { value: 'disabled', label: 'Disabled (Revoke workspace access)' },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Manage Member: ${member.fullName}`}
      subtitle="Update workspace permissions or membership status"
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Work Load Warning */}
        {status === 'disabled' && member.activeLeadsCount > 0 && (
          <div className="p-3 bg-status-warning-bg border border-amber-200 rounded-lg text-xs text-status-warning flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Member Has Active Assigned Leads!</strong>
              <span>
                {member.fullName} is currently assigned to <strong>{member.activeLeadsCount} active leads</strong>. Disabling this member will revoke their access, but their assigned leads will NOT be deleted. Please reassign their leads afterwards.
              </span>
            </div>
          </div>
        )}

        {isOwner && (
          <Select
            label="Workspace Role"
            options={roleOptions}
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
          />
        )}

        <Select
          label="Membership Status"
          options={statusOptions}
          value={status}
          onChange={(e) => setStatus(e.target.value as MemberStatus)}
        />

        <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleRoleChange} isLoading={loading}>
            Save Role & Status
          </Button>
        </div>
      </div>
    </Modal>
  )
}
