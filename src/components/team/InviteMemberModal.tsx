import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import { teamApi } from '../../lib/teamApi'
import { APP_CONFIG } from '../../lib/config'
import type { WorkspaceRole } from '../../types/database.types'
import { AlertCircle, Mail, Copy, Check, Info, UserPlus } from 'lucide-react'

export interface InviteMemberModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('agent')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isOwner = currentRole === 'owner'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace) return
    if (!email.trim()) {
      setError('Email address is required.')
      return
    }

    setLoading(true)
    setError(null)
    setInviteUrl(null)

    try {
      const rawToken = await teamApi.createInvitation(currentWorkspace.id, email.trim(), role)
      const baseUrl = APP_CONFIG.appUrl.replace(/\/$/, '')
      const url = `${baseUrl}/invite/${rawToken}`
      setInviteUrl(url)
      setEmail('')
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create invitation'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const roleOptions = isOwner
    ? [
        { value: 'agent', label: 'Sales Agent (Assigned leads & queue)' },
        { value: 'manager', label: 'Operations Manager (Team oversight & reports)' },
      ]
    : [{ value: 'agent', label: 'Sales Agent (Assigned leads & queue)' }]

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setInviteUrl(null)
        setError(null)
        onClose()
      }}
      title="Invite Team Member"
      subtitle={`Generate an invitation link for ${currentWorkspace?.name}`}
      maxWidth="md"
    >
      {inviteUrl ? (
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-xs text-emerald-800">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>
              Invitation link generated! Copy and share this link directly with your team member.
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-navy-900 block">Shareable Invitation Link</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 bg-slate-50 border border-surface-border rounded-lg px-3 py-2 text-xs font-mono text-navy-900 select-all focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <Button
                variant={copied ? 'secondary' : 'primary'}
                size="sm"
                type="button"
                onClick={handleCopyLink}
                icon={copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                className="shrink-0"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          </div>

          <div className="pt-3 flex justify-end border-t border-surface-border">
            <Button
              variant="outline"
              onClick={() => {
                setInviteUrl(null)
                onClose()
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Input
            label="Team Member Work Email *"
            type="email"
            placeholder="agent@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />

          <Select
            label="Workspace Role *"
            options={roleOptions}
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
          />

          <div className="p-3 bg-slate-50 border border-surface-border rounded-lg text-[11px] text-content-secondary space-y-1">
            <span className="font-bold text-navy-900 block">Invitation Security Rules:</span>
            <p>• The generated invitation link is valid for 7 days.</p>
            <p>• Only an account matching <strong className="text-navy-900">{email || 'the specified email'}</strong> can accept this invitation.</p>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-surface-border">
            <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={loading} icon={<UserPlus className="w-4 h-4" />}>
              Generate Invitation Link
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
