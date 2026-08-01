import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingState } from '../../components/ui/LoadingState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { formsApi, type LeadFormConfig } from '../../lib/formsApi'

import {
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Save,
  Lock
} from 'lucide-react'

export const LeadFormsPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [formConfig, setFormConfig] = useState<LeadFormConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form Editor State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [showEmail, setShowEmail] = useState(true)
  const [showSource, setShowSource] = useState(true)
  const [showBudget, setShowBudget] = useState(true)

  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const loadFormConfig = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const data = await formsApi.getWorkspaceLeadForm(currentWorkspace.id)
      if (data) {
        setFormConfig(data)
        setTitle(data.title)
        setDescription(data.description || '')
        setIsActive(data.is_active)
        setShowEmail(data.show_email)
        setShowSource(data.show_source)
        setShowBudget(data.show_budget)
      }
    } catch (err: unknown) {
      console.error('Error loading lead form configuration:', err)
      const msg = err instanceof Error ? err.message : 'Failed to load lead form configuration'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadFormConfig()
    })
  }, [loadFormConfig])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace || !isOwnerOrManager) return

    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const updated = await formsApi.updateWorkspaceLeadForm({
        workspace_id: currentWorkspace.id,
        title: title.trim(),
        description: description.trim() || undefined,
        is_active: isActive,
        show_email: showEmail,
        show_source: showSource,
        show_budget: showBudget,
      })

      setFormConfig(updated)
      setSuccessMessage('Lead capture form configuration updated successfully!')
    } catch (err: unknown) {
      console.error('Error saving lead form:', err)
      const msg = err instanceof Error ? err.message : 'Failed to update lead form configuration'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const publicUrl = formConfig
    ? `${window.location.origin}/forms/${formConfig.slug}`
    : ''

  const handleCopyLink = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading) {
    return (
      <Card>
        <LoadingState label="Loading Lead Form settings..." />
      </Card>
    )
  }

  return (
    <div className="space-y-7 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="pb-3 border-b border-surface-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight">
            Lead Capture Forms
          </h1>
          <p className="text-sm text-content-secondary mt-1">
            Configure your workspace public inquiry form to automatically ingest leads into your pipeline.
          </p>
        </div>

        {formConfig && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={copied ? <CheckCircle2 className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4 text-brand-blue" />}
              onClick={handleCopyLink}
            >
              {copied ? 'Link Copied!' : 'Copy Public Link'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<ExternalLink className="w-4 h-4" />}
              onClick={() => window.open(publicUrl, '_blank')}
            >
              Preview Form
            </Button>
          </div>
        )}
      </div>

      {/* Access Restriction Guard for Agents */}
      {!isOwnerOrManager ? (
        <Card>
          <div className="py-12 text-center space-y-3">
            <Lock className="w-8 h-8 text-content-muted mx-auto" />
            <h3 className="font-heading font-bold text-lg text-navy-900">Manager Access Required</h3>
            <p className="text-xs text-content-secondary max-w-md mx-auto">
              Only Workspace Owners and Managers can configure Lead Capture Forms. Please ask your administrator to update form settings.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Config Form */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSave}>
              <Card
                title="Public Form Configuration"
                subtitle="Customize title, description, and visible fields for visitors."
                action={
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    icon={<Save className="w-3.5 h-3.5" />}
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                }
              >
                {error && (
                  <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2.5 mb-4">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-status-success flex items-start gap-2.5 mb-4">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Status Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50/70 border border-surface-border/60 rounded-xl">
                    <div>
                      <span className="font-bold text-xs text-navy-900 block">Form Active Status</span>
                      <span className="text-[11px] text-content-secondary block mt-0.5">
                        When enabled, visitors can submit inquiries to your workspace.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsActive(!isActive)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isActive ? 'bg-brand-blue' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Form Title */}
                  <Input
                    label="Public Form Title *"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Connect with Our Sales Team"
                  />

                  {/* Form Description */}
                  <div>
                    <label className="block text-xs font-bold text-navy-900 mb-1.5">
                      Form Description (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Send us your project details and we will reach out shortly."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all"
                    />
                  </div>

                  {/* Field Visibility Toggles */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-content-secondary">
                      Optional Field Visibility
                    </h4>

                    {/* Email Toggle */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-surface-border/40 rounded-xl">
                      <span className="text-xs font-semibold text-navy-900">Show Email Address Field</span>
                      <input
                        type="checkbox"
                        checked={showEmail}
                        onChange={(e) => setShowEmail(e.target.checked)}
                        className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                      />
                    </div>

                    {/* Source Toggle */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-surface-border/40 rounded-xl">
                      <span className="text-xs font-semibold text-navy-900">Show Source / Channel Field</span>
                      <input
                        type="checkbox"
                        checked={showSource}
                        onChange={(e) => setShowSource(e.target.checked)}
                        className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                      />
                    </div>

                    {/* Budget Toggle */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-surface-border/40 rounded-xl">
                      <span className="text-xs font-semibold text-navy-900">Show Estimated Budget / Value Field</span>
                      <input
                        type="checkbox"
                        checked={showBudget}
                        onChange={(e) => setShowBudget(e.target.checked)}
                        className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </form>
          </div>

          {/* Form Info & Analytics Side Card */}
          <div className="space-y-6">
            <Card title="Public Integration" subtitle="Share your form link with clients">
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-surface-border/60 space-y-1">
                  <span className="text-[10px] font-bold text-content-secondary uppercase tracking-wider block">Form Public Link</span>
                  <p className="text-xs font-mono text-navy-900 break-all">{publicUrl}</p>
                </div>

                <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-950">Total Form Submissions</span>
                    <Badge variant="blue" className="font-bold">{formConfig?.submission_count || 0}</Badge>
                  </div>
                  <p className="text-content-secondary text-[11px]">
                    Leads created via public forms are tagged as <span className="font-bold">Public Form</span> and automatically ingested into your pipeline.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-surface-border/60 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-navy-900 block">Tracking Query Parameters</span>
                  <p className="text-content-secondary text-[11px]">
                    Append <code className="bg-white px-1.5 py-0.5 border border-surface-border rounded text-brand-blue font-mono">?source=instagram</code> to track ad campaign sources automatically.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
