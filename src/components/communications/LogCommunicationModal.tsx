import React, { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { communicationsApi, type MessageTemplate } from '../../lib/communicationsApi'
import { renderTemplateVariables } from '../../lib/whatsapp'
import { ArrowDownLeft, ArrowUpRight, Calendar, AlertCircle, Sparkles } from 'lucide-react'

export interface LogCommunicationModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: string
  leadName: string
  leadPhone: string
  leadRequirement?: string
  assignedAgentName?: string
  nextFollowUpDate?: string
  initialDirection?: 'incoming' | 'outgoing'
  onSuccess?: () => void
}

export const LogCommunicationModal: React.FC<LogCommunicationModalProps> = ({
  isOpen,
  onClose,
  leadId,
  leadName,
  leadPhone,
  leadRequirement,
  assignedAgentName,
  nextFollowUpDate,
  initialDirection = 'outgoing',
  onSuccess,
}) => {
  const { currentWorkspace } = useWorkspace()
  const { profile } = useAuth()

  const [direction, setDirection] = useState<'incoming' | 'outgoing'>(initialDirection)
  const [message, setMessage] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templates, setTemplates] = useState<MessageTemplate[]>([])

  // Optional schedule follow-up
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpType, setFollowUpType] = useState('call')
  const [followUpNotes, setFollowUpNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      setDirection(initialDirection)
      setMessage('')
      setOccurredAt(new Date().toISOString().slice(0, 16))
      setSelectedTemplateId('')
      setScheduleFollowUp(false)
      setFollowUpDate('')
      setFollowUpNotes('')
      setError(null)

      if (currentWorkspace) {
        communicationsApi.getMessageTemplates(currentWorkspace.id).then(setTemplates).catch(console.error)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [isOpen, initialDirection, currentWorkspace])

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const tmpl = templates.find((t) => t.id === templateId)
    if (tmpl) {
      const rendered = renderTemplateVariables(tmpl.content, {
        leadName,
        agentName: assignedAgentName || profile?.full_name || 'Representative',
        workspaceName: currentWorkspace?.name || 'Noverlyn',
        propertyRequirement: leadRequirement || 'your requested property',
        nextFollowUpDate: nextFollowUpDate || 'soon',
      })
      setMessage(rendered)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('Message content cannot be empty.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await communicationsApi.logCommunication({
        lead_id: leadId,
        direction,
        message: message.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        schedule_followup: scheduleFollowUp && followUpDate ? new Date(followUpDate).toISOString() : undefined,
        followup_type: scheduleFollowUp ? followUpType : undefined,
        followup_notes: scheduleFollowUp ? followUpNotes.trim() || undefined : undefined,
      })

      onClose()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to log WhatsApp communication'
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
        form="log-whatsapp-comm-form"
        isLoading={submitting}
        icon={direction === 'incoming' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
      >
        Log {direction === 'incoming' ? 'Incoming' : 'Outgoing'} Message
      </Button>
    </>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log WhatsApp Communication"
      subtitle={`Recording message for ${leadName} (${leadPhone})`}
      maxWidth="md"
      footer={modalFooter}
    >
      <form id="log-whatsapp-comm-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Direction Selector */}
        <div>
          <label className="block text-xs font-semibold text-navy-900 mb-1.5">Message Direction</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection('incoming')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                direction === 'incoming'
                  ? 'bg-blue-50 border-brand-blue text-brand-blue shadow-2xs'
                  : 'bg-slate-50 border-surface-border text-content-secondary hover:bg-slate-100'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4 text-brand-blue" />
              <span>Incoming (From Lead)</span>
            </button>

            <button
              type="button"
              onClick={() => setDirection('outgoing')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                direction === 'outgoing'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-2xs'
                  : 'bg-slate-50 border-surface-border text-content-secondary hover:bg-slate-100'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              <span>Outgoing (To Lead)</span>
            </button>
          </div>
        </div>

        {/* Template Quick Insert (For Outgoing) */}
        {direction === 'outgoing' && templates.length > 0 && (
          <div className="p-3 bg-slate-50/80 border border-surface-border/60 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-navy-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-blue" /> Quick Insert Template
              </span>
              <span className="text-[11px] text-content-muted">{templates.length} templates available</span>
            </div>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs text-navy-900 bg-white"
            >
              <option value="">Select a template to prefill message...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.category.toUpperCase()}] {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Message Content */}
        <div>
          <label className="block text-xs font-semibold text-navy-900 mb-1">Message Content *</label>
          <textarea
            rows={4}
            placeholder="Type or paste the WhatsApp message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-3 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            required
          />
        </div>

        {/* Date & Time */}
        <Input
          label="Occurred Date & Time *"
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          leftIcon={<Calendar className="w-4 h-4 text-content-muted" />}
          required
        />

        {/* Optional Schedule Next Follow-up */}
        <div className="p-3 bg-slate-50 border border-surface-border rounded-xl space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-navy-900 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleFollowUp}
              onChange={(e) => setScheduleFollowUp(e.target.checked)}
              className="rounded border-surface-border text-brand-blue focus:ring-brand-blue"
            />
            <span>Schedule Next Follow-up After Log</span>
          </label>

          {scheduleFollowUp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Input
                label="Follow-up Date & Time *"
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                leftIcon={<Calendar className="w-4 h-4" />}
                required={scheduleFollowUp}
              />
              <Select
                label="Follow-up Type"
                options={[
                  { value: 'call', label: 'Phone Call' },
                  { value: 'whatsapp', label: 'WhatsApp Message' },
                  { value: 'email', label: 'Email' },
                  { value: 'meeting', label: 'In-person Meeting' },
                  { value: 'viewing', label: 'Property Viewing' },
                  { value: 'other', label: 'Other Action' },
                ]}
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value)}
              />
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
