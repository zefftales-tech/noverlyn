import React, { useState } from 'react'
import { Modal } from './Modal'
import { Input } from './Input'
import { Button } from './Button'
import { APP_CONFIG } from '../../lib/config'
import { Send, CheckCircle2 } from 'lucide-react'

export interface SendFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SendFeedbackModal: React.FC<SendFeedbackModalProps> = ({ isOpen, onClose }) => {
  const [feedbackText, setFeedbackText] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedbackText.trim()) return

    // Open mailto link as fallback feedback channel
    const subject = encodeURIComponent(`[Noverlyn Beta Feedback] User Input`)
    const body = encodeURIComponent(`User Email: ${userEmail || 'Anonymous'}\n\nFeedback:\n${feedbackText}`)
    window.open(`mailto:${APP_CONFIG.supportEmail}?subject=${subject}&body=${body}`, '_blank')

    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setFeedbackText('')
      setUserEmail('')
      onClose()
    }, 2000)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send Beta Feedback">
      {submitted ? (
        <div className="py-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 text-status-success flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-heading font-bold text-lg text-navy-900">Thank you for your feedback!</h3>
          <p className="text-xs text-content-secondary max-w-xs mx-auto">
            Your insights help us refine Noverlyn for all teams.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <p className="text-xs text-content-secondary">
            Have a suggestion, bug report, or feature request? Let our product team know.
          </p>

          <Input
            label="Your Email (Optional)"
            type="email"
            placeholder="you@company.com"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-navy-900 block">Feedback / Feature Request *</label>
            <textarea
              required
              rows={4}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Tell us what's working well or what we can improve..."
              className="w-full bg-white border border-surface-border rounded-lg p-3 text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<Send className="w-4 h-4" />}>
              Submit Feedback
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
