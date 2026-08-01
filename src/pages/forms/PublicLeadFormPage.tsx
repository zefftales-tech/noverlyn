import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { formsApi, type PublicFormInfo } from '../../lib/formsApi'
import { BUSINESS_TEMPLATES, type BusinessType } from '../../lib/templates'
import { NoverlynLogo } from '../../components/ui/NoverlynLogo'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/LoadingState'
import {
  Building2,
  CheckCircle2,
  Send,
  AlertCircle,
  ShieldCheck,
  Globe,
  Sparkles,
  Phone,
  User,
  Mail,
  DollarSign,
  HelpCircle,
  Calendar
} from 'lucide-react'

export const PublicLeadFormPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [formInfo, setFormInfo] = useState<PublicFormInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Standard Form Fields State
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [requirement, setRequirement] = useState('')
  const [sourceChannel, setSourceChannel] = useState(() => searchParams.get('source') || '')
  const [budget, setBudget] = useState('')
  const [honeypot, setHoneypot] = useState('') // Hidden spam trap

  // Custom Answers State
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | boolean | number>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submittedSuccess, setSubmittedSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return

    let isSubscribed = true

    formsApi
      .getPublicFormInfo(slug)
      .then((data) => {
        if (!isSubscribed) return
        setFormInfo(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!isSubscribed) return
        console.error('[PublicLeadForm Error]', err)
        const msg = err instanceof Error ? err.message : 'Inquiry form is unavailable or inactive'
        setError(msg)
      })
      .finally(() => {
        if (isSubscribed) {
          setLoading(false)
        }
      })

    return () => {
      isSubscribed = false
    }
  }, [slug])

  const handleCustomAnswerChange = (key: string, value: string | boolean | number) => {
    setCustomAnswers((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slug) return

    if (!fullName.trim() || !phone.trim() || !requirement.trim()) {
      setSubmitError('Please fill out all required fields: Full Name, Phone, and Inquiry Details.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await formsApi.submitPublicForm({
        slug,
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        requirement: requirement.trim() || undefined,
        source: sourceChannel.trim() || undefined,
        budget: budget ? parseFloat(budget) : undefined,
        honeypot: honeypot || undefined,
        custom_answers: customAnswers,
      })

      if (res.success) {
        setSubmittedSuccess(true)
      } else {
        setSubmitError(res.message || 'Submission temporarily unavailable. Please try again.')
      }
    } catch (err: unknown) {
      console.error('[PublicLeadForm Submit RPC Error]', err)
      const msg = err instanceof Error ? err.message : 'Submission temporarily unavailable. Please check required fields.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setSubmittedSuccess(false)
    setFullName('')
    setPhone('')
    setEmail('')
    setRequirement('')
    setBudget('')
    setCustomAnswers({})
    setSubmitError(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <LoadingState label="Loading inquiry form..." />
      </div>
    )
  }

  if (error || !formInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 border border-surface-border shadow-saas text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-status-critical flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="font-heading font-bold text-xl text-navy-900">Form Unavailable</h2>
          <p className="text-xs text-content-secondary">{error || 'This inquiry form does not exist or is currently inactive.'}</p>
        </div>
      </div>
    )
  }

  const bType = (formInfo.business_type as BusinessType) || 'real_estate'
  const template = BUSINESS_TEMPLATES[bType]
  const requirementLabel = template?.requirementLabel || 'Requirement & Notes'
  const activeCustomFields = (formInfo.custom_fields || []).filter((cf) => cf.is_active)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {/* Brand & Workspace Banner Header */}
        <div className="bg-white border border-surface-border/80 rounded-2xl p-6 shadow-saas space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-border/60">
            <div className="flex items-center gap-3">
              <NoverlynLogo variant="mark" size="sm" />
              <div>
                <span className="font-heading font-bold text-base text-navy-900 block leading-tight">
                  {formInfo.workspace_name}
                </span>
                <span className="text-[11px] font-medium text-content-secondary flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3 text-brand-blue" />
                  {template?.title || 'Business Operations'}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
              Public Inquiry
            </span>
          </div>

          <div>
            <h1 className="font-heading font-extrabold text-2xl text-navy-900 tracking-tight">
              {formInfo.title}
            </h1>
            {formInfo.description && (
              <p className="text-xs text-content-secondary mt-1.5 leading-relaxed">
                {formInfo.description}
              </p>
            )}
          </div>
        </div>

        {/* Success Confirmation Card */}
        {submittedSuccess ? (
          <div className="bg-white border border-surface-border/80 rounded-2xl p-8 shadow-saas text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-status-success flex items-center justify-center mx-auto ring-8 ring-emerald-50/50">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-extrabold text-xl text-navy-900">Inquiry Received!</h3>
              <p className="text-xs text-content-secondary max-w-sm mx-auto">
                Thank you for reaching out to <span className="font-bold text-navy-900">{formInfo.workspace_name}</span>. A representative will contact you shortly.
              </p>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={handleReset} icon={<Sparkles className="w-3.5 h-3.5" />}>
                Submit Another Inquiry
              </Button>
            </div>
          </div>
        ) : (
          /* Lead Capture Form */
          <form onSubmit={handleSubmit} className="bg-white border border-surface-border/80 rounded-2xl p-6 sm:p-8 shadow-saas space-y-7">
            {submitError && (
              <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Hidden Honeypot Field for Spam Protection */}
            <input
              type="text"
              name="website_url_hp"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
            />

            {/* SECTION 1: Contact Information */}
            <div className="space-y-4">
              <div className="pb-1 border-b border-surface-border/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> SECTION 1 — Contact Information
                </h3>
              </div>

              <Input
                label="Full Name *"
                type="text"
                placeholder="e.g. Sarah Jenkins"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                leftIcon={<User className="w-4 h-4 text-content-muted" />}
              />

              <Input
                label="Phone Number *"
                type="tel"
                placeholder="e.g. +1 555 019 2831"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                leftIcon={<Phone className="w-4 h-4 text-content-muted" />}
              />

              {formInfo.show_email && (
                <Input
                  label="Email Address (Optional)"
                  type="email"
                  placeholder="e.g. sarah@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="w-4 h-4 text-content-muted" />}
                />
              )}
            </div>

            {/* SECTION 2: Inquiry Details */}
            <div className="space-y-4">
              <div className="pb-1 border-b border-surface-border/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> SECTION 2 — Inquiry Details
                </h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-navy-900 mb-1.5">
                  {requirementLabel} *
                </label>
                <textarea
                  rows={3}
                  placeholder="Tell us what you are looking for..."
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all"
                />
              </div>

              {formInfo.show_source && (
                <Input
                  label="Source / Channel (Optional)"
                  type="text"
                  placeholder="e.g. Website, Instagram, Referral"
                  value={sourceChannel}
                  onChange={(e) => setSourceChannel(e.target.value)}
                  leftIcon={<Globe className="w-4 h-4 text-content-muted" />}
                />
              )}

              {formInfo.show_budget && (
                <Input
                  label={`Estimated Budget / Value (${formInfo.currency}) (Optional)`}
                  type="number"
                  placeholder="e.g. 500000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  leftIcon={<DollarSign className="w-4 h-4 text-content-muted" />}
                />
              )}
            </div>

            {/* SECTION 3: Custom Questions */}
            {activeCustomFields.length > 0 && (
              <div className="space-y-4">
                <div className="pb-1 border-b border-surface-border/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-blue flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" /> SECTION 3 — Additional Questions
                  </h3>
                </div>

                {activeCustomFields.map((cf) => (
                  <div key={cf.id} className="space-y-1.5">
                    <label className="block text-xs font-bold text-navy-900">
                      {cf.label} {cf.required && <span className="text-status-critical">*</span>}
                    </label>

                    {cf.type === 'short_text' && (
                      <Input
                        type="text"
                        placeholder={cf.placeholder || `Enter ${cf.label.toLowerCase()}...`}
                        value={(customAnswers[cf.key] as string) || ''}
                        onChange={(e) => handleCustomAnswerChange(cf.key, e.target.value)}
                        required={cf.required}
                      />
                    )}

                    {cf.type === 'long_text' && (
                      <textarea
                        rows={3}
                        placeholder={cf.placeholder || `Enter ${cf.label.toLowerCase()}...`}
                        value={(customAnswers[cf.key] as string) || ''}
                        onChange={(e) => handleCustomAnswerChange(cf.key, e.target.value)}
                        required={cf.required}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all"
                      />
                    )}

                    {cf.type === 'number' && (
                      <Input
                        type="number"
                        placeholder={cf.placeholder || 'Enter number...'}
                        value={(customAnswers[cf.key] as string) || ''}
                        onChange={(e) => handleCustomAnswerChange(cf.key, e.target.value)}
                        required={cf.required}
                      />
                    )}

                    {cf.type === 'select' && (
                      <select
                        value={(customAnswers[cf.key] as string) || ''}
                        onChange={(e) => handleCustomAnswerChange(cf.key, e.target.value)}
                        required={cf.required}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white"
                      >
                        <option value="">{cf.placeholder || 'Select an option...'}</option>
                        {(cf.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}

                    {cf.type === 'date' && (
                      <Input
                        type="date"
                        value={(customAnswers[cf.key] as string) || ''}
                        onChange={(e) => handleCustomAnswerChange(cf.key, e.target.value)}
                        required={cf.required}
                        leftIcon={<Calendar className="w-4 h-4 text-content-muted" />}
                      />
                    )}

                    {cf.type === 'checkbox' && (
                      <label className="flex items-center gap-2 cursor-pointer p-3 bg-slate-50 border border-surface-border rounded-xl">
                        <input
                          type="checkbox"
                          checked={Boolean(customAnswers[cf.key])}
                          onChange={(e) => handleCustomAnswerChange(cf.key, e.target.checked)}
                          className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                        />
                        <span className="text-xs font-medium text-navy-900">{cf.placeholder || 'Yes, I agree'}</span>
                      </label>
                    )}

                    {cf.help_text && (
                      <p className="text-[11px] text-content-secondary">{cf.help_text}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              className="w-full justify-center font-bold text-sm py-3"
              icon={<Send className="w-4 h-4" />}
            >
              {submitting ? 'Submitting Inquiry...' : 'Submit Inquiry'}
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-content-secondary pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Protected & Encrypted via Noverlyn Operations</span>
            </div>
          </form>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center pt-8 text-xs text-content-secondary">
        <p>© {new Date().getFullYear()} {formInfo.workspace_name}. Powered by Noverlyn.</p>
      </footer>
    </div>
  )
}
