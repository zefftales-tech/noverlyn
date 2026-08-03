import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useWorkspace } from '../../hooks/useWorkspace'
import { whatsappCloudApi } from '../../lib/whatsappCloudApi'
import { normalizePhoneNumber } from '../../lib/whatsapp'
import { Send, AlertCircle, CheckCircle2, Phone, Code } from 'lucide-react'

export interface SendTestMessageModalProps {
  isOpen: boolean
  onClose: () => void
  phoneNumberId?: string | null
}

export const SendTestMessageModal: React.FC<SendTestMessageModalProps> = ({
  isOpen,
  onClose,
  phoneNumberId,
}) => {
  const { currentWorkspace } = useWorkspace()

  const [recipientPhone, setRecipientPhone] = useState('')
  const [templateName, setTemplateName] = useState('hello_world')
  const [languageCode, setLanguageCode] = useState('en_US')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ messageId: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setRecipientPhone('')
        setTemplateName('hello_world')
        setLanguageCode('en_US')
        setError(null)
        setResult(null)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const parsedPhone = normalizePhoneNumber(recipientPhone)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace) return

    if (!parsedPhone.isValid) {
      setError(`Invalid phone number: ${recipientPhone}. Please enter a valid number with country code.`)
      return
    }

    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const res = await whatsappCloudApi.sendTestMessage({
        workspace_id: currentWorkspace.id,
        recipient_phone: parsedPhone.normalized,
        template_name: templateName.trim(),
        language_code: languageCode.trim(),
      })

      setResult({ messageId: res.message_id })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send test message via Meta API'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const payloadPreview = {
    messaging_product: 'whatsapp',
    to: parsedPhone.normalized || '14155550192',
    type: 'template',
    template: {
      name: templateName || 'hello_world',
      language: { code: languageCode || 'en_US' },
    },
  }

  const modalFooter = (
    <>
      <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
        Close
      </Button>
      <Button
        variant="primary"
        type="submit"
        form="send-test-whatsapp-form"
        isLoading={submitting}
        disabled={!recipientPhone || !parsedPhone.isValid}
        icon={<Send className="w-4 h-4" />}
      >
        Send Test Message
      </Button>
    </>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send WhatsApp Cloud API Test Message"
      subtitle={`Testing Phone Number ID: ${phoneNumberId || 'Connected Account'}`}
      maxWidth="md"
      footer={modalFooter}
    >
      <form id="send-test-whatsapp-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Test Message Accepted by Meta Cloud API!</span>
            </div>
            <p className="text-[11px] text-content-secondary font-mono">
              Message ID: <code>{result.messageId}</code>
            </p>
          </div>
        )}

        <Input
          label="Recipient Phone Number (with Country Code) *"
          placeholder="e.g. +14155550192 or 447911123456"
          value={recipientPhone}
          onChange={(e) => setRecipientPhone(e.target.value)}
          leftIcon={<Phone className="w-4 h-4" />}
          required
        />

        {recipientPhone && !parsedPhone.isValid && (
          <p className="text-[11px] text-status-critical font-medium">
            {parsedPhone.warning || 'Invalid phone format'}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Template Name *"
            placeholder="e.g. hello_world"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            required
          />
          <Input
            label="Language Code *"
            placeholder="e.g. en_US"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            required
          />
        </div>

        {/* Payload Preview */}
        <div className="p-3 bg-slate-900 text-slate-100 rounded-xl space-y-1.5 font-mono text-[11px]">
          <span className="text-slate-400 font-sans font-bold flex items-center gap-1">
            <Code className="w-3.5 h-3.5 text-brand-blue" /> Server Graph API Payload Preview:
          </span>
          <pre className="overflow-x-auto text-[10px] text-emerald-400 p-1">
            {JSON.stringify(payloadPreview, null, 2)}
          </pre>
        </div>
      </form>
    </Modal>
  )
}
