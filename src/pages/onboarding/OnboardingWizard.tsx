import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { BUSINESS_TEMPLATES, type BusinessType } from '../../lib/templates'
import { Building2, Globe, Users, CheckCircle, ArrowRight, ArrowLeft, AlertCircle, Layers } from 'lucide-react'

export const OnboardingWizard: React.FC = () => {
  const { createWorkspace } = useWorkspace()
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1: Company & Business Type
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('real_estate')

  // Step 2: Settings
  const [timezone, setTimezone] = useState('UTC')
  const [currency, setCurrency] = useState('USD')

  // Step 3: Invite Team (Skeleton)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'agent'>('agent')
  const [invitedList, setInvitedList] = useState<{ email: string; role: string }[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameChange = (nameVal: string) => {
    setCompanyName(nameVal)
    const generatedSlug = nameVal
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
    setSlug(generatedSlug)
  }

  const addInvite = () => {
    if (!inviteEmail.trim()) return
    setInvitedList([...invitedList, { email: inviteEmail.trim(), role: inviteRole }])
    setInviteEmail('')
  }

  const handleFinish = async () => {
    if (!companyName.trim() || !slug.trim()) {
      setError('Please provide a valid company name and slug.')
      setStep(1)
      return
    }

    setLoading(true)
    setError(null)

    const { workspaceId, error: createErr } = await createWorkspace(
      companyName.trim(),
      slug.trim(),
      timezone,
      currency,
      businessType
    )

    if (createErr || !workspaceId) {
      setError(createErr?.message || 'Failed to create company workspace.')
      setLoading(false)
    } else {
      navigate('/', { replace: true })
    }
  }

  const timezoneOptions = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
    { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  ]

  const currencyOptions = [
    { value: 'USD', label: 'USD ($) - US Dollar' },
    { value: 'EUR', label: 'EUR (€) - Euro' },
    { value: 'GBP', label: 'GBP (£) - British Pound' },
    { value: 'AED', label: 'AED (AED) - UAE Dirham' },
    { value: 'CAD', label: 'CAD ($) - Canadian Dollar' },
    { value: 'AUD', label: 'AUD ($) - Australian Dollar' },
    { value: 'SGD', label: 'SGD ($) - Singapore Dollar' },
  ]

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-navy-900 flex items-center justify-center text-white font-bold">
              N
            </div>
            <div>
              <span className="font-heading font-extrabold text-lg text-navy-900 tracking-tight">NOVERLYN</span>
              <span className="text-xs text-content-secondary ml-2 font-medium">Workspace Setup</span>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs text-content-secondary hover:text-navy-900 underline"
          >
            Sign Out
          </button>
        </div>

        {/* Wizard Steps Indicator */}
        <div className="flex items-center justify-between mb-8 px-2">
          {[
            { num: 1, label: 'Company', icon: <Building2 className="w-4 h-4" /> },
            { num: 2, label: 'Settings', icon: <Globe className="w-4 h-4" /> },
            { num: 3, label: 'Team', icon: <Users className="w-4 h-4" /> },
            { num: 4, label: 'Finish', icon: <CheckCircle className="w-4 h-4" /> },
          ].map((s) => {
            const isActive = step === s.num
            const isDone = step > s.num
            return (
              <div key={s.num} className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    isDone
                      ? 'bg-status-success text-white'
                      : isActive
                      ? 'bg-brand-blue text-white ring-4 ring-brand-blue/15'
                      : 'bg-slate-200 text-content-muted'
                  }`}
                >
                  {s.icon}
                </div>
                <span className={`text-[11px] font-medium ${isActive ? 'text-navy-900 font-bold' : 'text-content-muted'}`}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Main Wizard Card */}
        <div className="bg-surface-card border border-surface-border rounded-xl shadow-xs p-6 sm:p-8 space-y-6">
          {error && (
            <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CREATE COMPANY */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-heading font-bold text-lg text-navy-900">1. Set up your Noverlyn Workspace</h2>
                <p className="text-xs text-content-secondary mt-1">
                  Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}! Create your company workspace to manage leads and follow-ups.
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  label="Company Name"
                  placeholder="e.g. Acme Corporation"
                  value={companyName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                />

                <div className="space-y-1">
                  <Input
                    label="Workspace Identifier (Slug)"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="acme-corp"
                    required
                  />
                  <p className="text-[11px] text-content-muted">
                    Workspace URL preview: <span className="font-mono text-brand-blue">noverlyn.com/app/{slug || 'company-slug'}</span>
                  </p>
                </div>

                {/* Business Vertical Selection */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-navy-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-brand-blue" />
                    <span>What type of business are you setting up?</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(BUSINESS_TEMPLATES) as BusinessType[]).map((key) => {
                      const tmpl = BUSINESS_TEMPLATES[key]
                      const isSelected = businessType === key
                      return (
                        <div
                          key={key}
                          onClick={() => setBusinessType(key)}
                          className={`p-3 border rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'border-brand-blue bg-blue-50/50 ring-2 ring-brand-blue/20'
                              : 'border-surface-border bg-slate-50/50 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-navy-900">{tmpl.title}</span>
                            {isSelected && <CheckCircle className="w-4 h-4 text-brand-blue" />}
                          </div>
                          <p className="text-[11px] text-content-secondary mt-1 leading-normal">
                            {tmpl.description}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button
                  onClick={() => {
                    if (!companyName.trim() || !slug.trim()) {
                      setError('Company name and slug are required.')
                      return
                    }
                    setError(null)
                    setStep(2)
                  }}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Continue to Settings
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: COMPANY SETTINGS */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-heading font-bold text-lg text-navy-900">2. Regional & Operating Preferences</h2>
                <p className="text-xs text-content-secondary mt-1">
                  Set the default timezone and primary currency for deal evaluations and follow-up scheduling.
                </p>
              </div>

              <div className="space-y-4">
                <Select
                  label="Business Timezone"
                  options={timezoneOptions}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />

                <Select
                  label="Primary Currency"
                  options={currencyOptions}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>

              <div className="pt-4 flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Continue to Team Invites
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: INVITE TEAM */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="font-heading font-bold text-lg text-navy-900">3. Invite Sales Team & Members</h2>
                  <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">Optional</span>
                </div>
                <p className="text-xs text-content-secondary mt-1">
                  You can invite managers and agents now or add them later from Team Settings.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-surface-border rounded-lg space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Input
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <Select
                    options={[
                      { value: 'agent', label: 'Agent' },
                      { value: 'manager', label: 'Manager' },
                    ]}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'manager' | 'agent')}
                  />
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={addInvite}>
                    Add to Invite List
                  </Button>
                </div>
              </div>

              {invitedList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-content-primary">Pending Invitations ({invitedList.length}):</p>
                  <ul className="divide-y divide-surface-border border border-surface-border rounded-lg bg-white overflow-hidden text-xs">
                    {invitedList.map((item, idx) => (
                      <li key={idx} className="p-2.5 flex justify-between items-center">
                        <span className="text-navy-900 font-medium">{item.email}</span>
                        <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-brand-blue">
                          {item.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-4 flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Skip / Continue
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: FINISH */}
          {step === 4 && (
            <div className="space-y-5 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 text-status-success flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6" />
              </div>

              <div>
                <h2 className="font-heading font-bold text-xl text-navy-900">Ready to Launch Noverlyn</h2>
                <p className="text-xs text-content-secondary mt-1 max-w-sm mx-auto">
                  We are about to initialize <span className="font-semibold text-navy-900">{companyName}</span> with template <span className="font-bold text-brand-blue">{BUSINESS_TEMPLATES[businessType].title}</span>.
                </p>
              </div>

              <div className="bg-slate-50 border border-surface-border rounded-lg p-4 text-left text-xs space-y-2 max-w-md mx-auto">
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-content-secondary">Company Name:</span>
                  <span className="font-semibold text-navy-900">{companyName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-content-secondary">Business Type:</span>
                  <span className="font-semibold text-brand-blue">{BUSINESS_TEMPLATES[businessType].title}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-content-secondary">Slug:</span>
                  <span className="font-mono text-brand-blue">{slug}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-content-secondary">Timezone:</span>
                  <span className="font-medium text-navy-900">{timezone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-secondary">Currency:</span>
                  <span className="font-medium text-navy-900">{currency}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={() => setStep(3)}
                  disabled={loading}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleFinish}
                  isLoading={loading}
                  icon={<CheckCircle className="w-5 h-5" />}
                >
                  Complete Setup & Open Workspace
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
