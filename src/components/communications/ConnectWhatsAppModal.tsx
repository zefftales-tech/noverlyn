import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useWorkspace } from '../../hooks/useWorkspace'
import { whatsappCloudApi } from '../../lib/whatsappCloudApi'
import { ShieldCheck, Lock, ExternalLink, AlertCircle, CheckCircle2, Key } from 'lucide-react'

export interface ConnectWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const ConnectWhatsAppModal: React.FC<ConnectWhatsAppModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const isOwner = currentRole === 'owner'

  const [wabaId, setWabaId] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [metaBusinessId, setMetaBusinessId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setWabaId('')
        setPhoneNumberId('')
        setAccessToken('')
        setMetaBusinessId('')
        setError(null)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace) return
    if (!isOwner) {
      setError('Only workspace owners can connect WhatsApp Cloud API.')
      return
    }

    if (!wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim()) {
      setError('WABA ID, Phone Number ID, and Access Token are required.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await whatsappCloudApi.connect({
        workspace_id: currentWorkspace.id,
        waba_id: wabaId.trim(),
        phone_number_id: phoneNumberId.trim(),
        access_token: accessToken.trim(),
        meta_business_id: metaBusinessId.trim() || undefined,
      })

      // Clear token from memory after success
      setAccessToken('')
      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect WhatsApp Cloud API'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const modalFooter = (
    <>
      <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        type="submit"
        form="connect-whatsapp-form"
        isLoading={submitting}
        icon={<CheckCircle2 className="w-4 h-4" />}
      >
        Verify & Connect
      </Button>
    </>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect WhatsApp Business Cloud API"
      subtitle={`Configure Meta Cloud API credentials for ${currentWorkspace?.name}`}
      maxWidth="lg"
      footer={modalFooter}
    >
      <form id="connect-whatsapp-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Security Notice */}
        <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
          <div className="space-y-1 text-content-secondary">
            <span className="font-bold text-navy-900 block">Bank-Grade Token Security</span>
            <p>
              Your Meta System User token is stored in encrypted server credentials and accessed exclusively through secure Edge Functions. It is never exposed in browser storage, networks, or client code.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="WhatsApp Business Account ID (WABA ID) *"
            placeholder="e.g. 109823749281723"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            required
          />

          <Input
            label="Phone Number ID *"
            placeholder="e.g. 102938475610293"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-navy-900 mb-1 flex items-center justify-between">
            <span>Meta Permanent System User Token *</span>
            <span className="text-[11px] text-content-muted flex items-center gap-1 font-normal">
              <Lock className="w-3 h-3 text-emerald-600" /> Never shown after submission
            </span>
          </label>
          <div className="relative">
            <input
              type="password"
              placeholder="EAAxxxxx... (Paste system user access token)"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              autoComplete="off"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              required
            />
            <Key className="w-4 h-4 text-content-muted absolute left-3 top-2.5" />
          </div>
        </div>

        <Input
          label="Meta Business Manager ID (Optional)"
          placeholder="e.g. 987654321012345"
          value={metaBusinessId}
          onChange={(e) => setMetaBusinessId(e.target.value)}
        />

        {/* Setup Guidance Helper */}
        <div className="p-3 bg-slate-50 border border-surface-border/60 rounded-xl space-y-1.5">
          <span className="font-bold text-[11px] text-navy-900 flex items-center justify-between">
            <span>How to get these values from Meta?</span>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-blue hover:underline flex items-center gap-1"
            >
              Meta Guide <ExternalLink className="w-3 h-3" />
            </a>
          </span>
          <p className="text-[11px] text-content-secondary leading-relaxed">
            1. Go to Meta App Dashboard &gt; WhatsApp &gt; API Setup.<br />
            2. Copy your <strong>Phone Number ID</strong> and <strong>WhatsApp Business Account ID</strong>.<br />
            3. Generate a <strong>System User Access Token</strong> in Business Settings with <code>whatsapp_business_messaging</code> permissions.
          </p>
        </div>
      </form>
    </Modal>
  )
}
