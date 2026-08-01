import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingState } from '../../components/ui/LoadingState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { formsApi, type LeadFormConfig, type CustomFieldDefinition, type CustomFieldType } from '../../lib/formsApi'
import { getTemplateForBusinessType } from '../../lib/templates'

import {
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit2,
  Sparkles,
  Layers,
  X,
  Archive,
  RotateCcw,
  AlertOctagon,
  Inbox,
  FileText
} from 'lucide-react'

type FormTab = 'active' | 'archived' | 'deleted'

export const LeadFormsPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FormTab>('active')
  const [formsList, setFormsList] = useState<LeadFormConfig[]>([])
  const [formConfig, setFormConfig] = useState<LeadFormConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Compact Stats
  const [activeCount, setActiveCount] = useState(0)
  const [archivedCount, setArchivedCount] = useState(0)
  const [deletedCount, setDeletedCount] = useState(0)
  const [pendingReviews, setPendingReviews] = useState(0)

  // Active Form Editor State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submissionMode, setSubmissionMode] = useState<'review' | 'automatic'>('review')
  const [showEmail, setShowEmail] = useState(true)
  const [showSource, setShowSource] = useState(true)
  const [showBudget, setShowBudget] = useState(true)
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])

  // Custom Field Modal/Editor State
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldType>('short_text')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldPlaceholder, setFieldPlaceholder] = useState('')
  const [fieldHelpText, setFieldHelpText] = useState('')
  const [fieldOptionsText, setFieldOptionsText] = useState('')

  // Permanent Delete Modal State
  const [permDeleteForm, setPermDeleteForm] = useState<LeadFormConfig | null>(null)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [isPermModalOpen, setIsPermModalOpen] = useState(false)
  const [permDeleting, setPermDeleting] = useState(false)

  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'
  const isOwner = currentRole === 'owner'
  const activeTemplate = getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type)

  const loadData = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch form list for current tab
      const data = await formsApi.getWorkspaceLeadForms(currentWorkspace.id, activeTab)
      setFormsList(data)

      if (activeTab === 'active' && data.length > 0) {
        const primary = data[0]
        setFormConfig(primary)
        setTitle(primary.title)
        setDescription(primary.description || '')
        setIsActive(primary.is_active)
        setSubmissionMode(primary.submission_mode || 'review')
        setShowEmail(primary.show_email)
        setShowSource(primary.show_source)
        setShowBudget(primary.show_budget)
        setCustomFields(primary.custom_fields || [])
      }

      // 2. Fetch counts for stats bar
      const act = await formsApi.getWorkspaceLeadForms(currentWorkspace.id, 'active')
      const arc = await formsApi.getWorkspaceLeadForms(currentWorkspace.id, 'archived')
      const del = await formsApi.getWorkspaceLeadForms(currentWorkspace.id, 'deleted')
      const pnd = await formsApi.getPendingCount(currentWorkspace.id)

      setActiveCount(act.length)
      setArchivedCount(arc.length)
      setDeletedCount(del.length)
      setPendingReviews(pnd)
    } catch (err: unknown) {
      console.error('Error loading lead form configuration:', err)
      const msg = err instanceof Error ? err.message : 'Failed to load lead form configuration'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, activeTab])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadData()
    })
  }, [loadData])

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
        submission_mode: submissionMode,
        show_email: showEmail,
        show_source: showSource,
        show_budget: showBudget,
        custom_fields: customFields,
      })

      setFormConfig(updated)
      setSuccessMessage('Lead capture form configuration & custom fields updated successfully!')
    } catch (err: unknown) {
      console.error('Error saving lead form:', err)
      const msg = err instanceof Error ? err.message : 'Failed to update lead form configuration'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  // Form Lifecycle Action Handlers
  const handleArchiveForm = async (formId: string) => {
    if (!confirm('Archive this form? Its public link will stop accepting submissions.')) return
    try {
      await formsApi.archiveLeadForm(formId)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to archive form')
    }
  }

  const handleRestoreArchivedForm = async (formId: string) => {
    try {
      await formsApi.restoreArchivedLeadForm(formId)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to restore archived form')
    }
  }

  const handleSoftDeleteForm = async (formId: string) => {
    if (!confirm('Move this form to Trash? Submission history will be preserved.')) return
    try {
      await formsApi.softDeleteLeadForm(formId)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to move form to Trash')
    }
  }

  const handleRestoreDeletedForm = async (formId: string) => {
    try {
      await formsApi.restoreDeletedLeadForm(formId)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to restore deleted form')
    }
  }

  const handleOpenPermDeleteModal = (form: LeadFormConfig) => {
    setPermDeleteForm(form)
    setConfirmationInput('')
    setIsPermModalOpen(true)
  }

  const handleExecutePermanentDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!permDeleteForm) return

    if (confirmationInput.trim().toUpperCase() !== 'DELETE') {
      alert('Confirmation text mismatch. Type DELETE to confirm.')
      return
    }

    setPermDeleting(true)
    try {
      await formsApi.permanentlyDeleteLeadForm(permDeleteForm.id, 'DELETE')
      setIsPermModalOpen(false)
      await loadData()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to permanently delete form')
    } finally {
      setPermDeleting(false)
    }
  }

  // Custom Field Handlers
  const openAddFieldModal = () => {
    if (customFields.length >= 10) {
      alert('Maximum 10 custom fields allowed per lead form.')
      return
    }
    setEditingFieldId(null)
    setFieldLabel('')
    setFieldType('short_text')
    setFieldRequired(false)
    setFieldPlaceholder('')
    setFieldHelpText('')
    setFieldOptionsText('')
    setIsFieldModalOpen(true)
  }

  const openEditFieldModal = (field: CustomFieldDefinition) => {
    setEditingFieldId(field.id)
    setFieldLabel(field.label)
    setFieldType(field.type)
    setFieldRequired(field.required)
    setFieldPlaceholder(field.placeholder || '')
    setFieldHelpText(field.help_text || '')
    setFieldOptionsText((field.options || []).join('\n'))
    setIsFieldModalOpen(true)
  }

  const handleSaveCustomField = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fieldLabel.trim()) {
      alert('Field label is required.')
      return
    }

    const optionsArray = fieldOptionsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)

    if (fieldType === 'select' && optionsArray.length === 0) {
      alert('Dropdown select type requires at least 1 option.')
      return
    }

    const generatedKey = fieldLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `field_${Date.now()}`

    if (editingFieldId) {
      setCustomFields((prev) =>
        prev.map((f) =>
          f.id === editingFieldId
            ? {
                ...f,
                label: fieldLabel.trim(),
                type: fieldType,
                required: fieldRequired,
                placeholder: fieldPlaceholder.trim() || undefined,
                help_text: fieldHelpText.trim() || undefined,
                options: fieldType === 'select' ? optionsArray : undefined,
              }
            : f
        )
      )
    } else {
      const newField: CustomFieldDefinition = {
        id: `cf_${Date.now()}`,
        key: generatedKey,
        label: fieldLabel.trim(),
        type: fieldType,
        required: fieldRequired,
        placeholder: fieldPlaceholder.trim() || undefined,
        help_text: fieldHelpText.trim() || undefined,
        options: fieldType === 'select' ? optionsArray : undefined,
        display_order: customFields.length + 1,
        is_active: true,
      }
      setCustomFields((prev) => [...prev, newField])
    }

    setIsFieldModalOpen(false)
  }

  const handleRemoveField = (id: string) => {
    setCustomFields((prev) => prev.filter((f) => f.id !== id))
  }

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === customFields.length - 1)) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const copy = [...customFields]
    const temp = copy[index]
    copy[index] = copy[targetIndex]
    copy[targetIndex] = temp
    setCustomFields(copy.map((f, i) => ({ ...f, display_order: i + 1 })))
  }

  const applyTemplateSuggestions = () => {
    const tmpl = (activeTemplate as unknown as { formCustomFields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string }> }).formCustomFields || []
    if (tmpl.length === 0) return
    const merged = [...customFields]

    tmpl.forEach((t: { key: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string }) => {
      if (!merged.some((m) => m.key === t.key)) {
        merged.push({
          id: `cf_${Date.now()}_${t.key}`,
          key: t.key,
          label: t.label,
          type: t.type as CustomFieldType,
          required: !!t.required,
          options: t.options,
          placeholder: t.placeholder,
          display_order: merged.length + 1,
          is_active: true,
        })
      }
    })
    setCustomFields(merged.slice(0, 10))
  }

  const publicUrl = formConfig ? `${window.location.origin}/forms/${formConfig.slug}` : ''

  const handleCopyLink = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="pb-3 border-b border-surface-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-brand-blue" />
            Lead Capture Forms
          </h1>
          <p className="text-sm text-content-secondary mt-1">
            Configure public inquiry form settings, custom questions, and lifecycle states for your workspace.
          </p>
        </div>

        {formConfig && activeTab === 'active' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              icon={copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              onClick={handleCopyLink}
            >
              {copied ? 'Copied Link!' : 'Copy Link'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<ExternalLink className="w-4 h-4" />}
              onClick={() => window.open(publicUrl, '_blank')}
            >
              Open Form
            </Button>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-surface-border rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-secondary block">Active Forms</span>
            <span className="font-heading font-extrabold text-lg text-navy-900">{activeCount}</span>
          </div>
          <Badge variant="success" size="sm">ACTIVE</Badge>
        </div>
        <div className="p-3 bg-white border border-surface-border rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-secondary block">Archived</span>
            <span className="font-heading font-extrabold text-lg text-navy-900">{archivedCount}</span>
          </div>
          <Badge variant="blue" size="sm">ARCHIVED</Badge>
        </div>
        <div className="p-3 bg-white border border-surface-border rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-secondary block">Trash</span>
            <span className="font-heading font-extrabold text-lg text-navy-900">{deletedCount}</span>
          </div>
          <Badge variant="critical" size="sm">TRASH</Badge>
        </div>
        <div className="p-3 bg-white border border-surface-border rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-secondary block">Pending Reviews</span>
            <span className="font-heading font-extrabold text-lg text-amber-600">{pendingReviews}</span>
          </div>
          <Inbox className="w-5 h-5 text-amber-500" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-border flex gap-4 text-xs font-bold select-none overflow-x-auto">
        {[
          { key: 'active', label: `Active Forms (${activeCount})` },
          { key: 'archived', label: `Archived Forms (${archivedCount})` },
          { key: 'deleted', label: `Trash (${deletedCount})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as FormTab)}
            className={`pb-3 border-b-2 transition-all whitespace-nowrap px-1 ${
              activeTab === tab.key
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-content-secondary hover:text-navy-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><LoadingState label="Loading lead forms..." /></Card>
      ) : error ? (
        <Card><div className="p-4 bg-red-50 text-status-critical text-xs rounded-xl">{error}</div></Card>
      ) : activeTab === 'active' && formConfig ? (
        <form onSubmit={handleSave} className="space-y-6">
          {successMessage && (
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-status-success flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form Settings & Custom Builder */}
            <div className="lg:col-span-2 space-y-6">
              <Card title="Public Form Settings" subtitle="Active status, title, submission mode, and standard toggles">
                <div className="space-y-5">
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

                  {/* Submission Handling Selector */}
                  <div className="p-4 bg-slate-50/70 border border-surface-border/60 rounded-xl space-y-2">
                    <div>
                      <span className="font-bold text-xs text-navy-900 block">Submission Handling</span>
                      <span className="text-[11px] text-content-secondary block mt-0.5">
                        Choose whether submissions must be reviewed before creating leads.
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        submissionMode === 'review' ? 'bg-blue-50/80 border-brand-blue ring-1 ring-brand-blue' : 'bg-white border-surface-border'
                      }`}>
                        <input
                          type="radio"
                          name="submissionMode"
                          value="review"
                          checked={submissionMode === 'review'}
                          onChange={() => setSubmissionMode('review')}
                          className="mt-0.5 text-brand-blue focus:ring-brand-blue"
                        />
                        <div>
                          <span className="font-bold text-xs text-navy-900 block">Review before creating lead (Default)</span>
                          <span className="text-[10px] text-content-secondary block mt-0.5">
                            Submissions enter Review Inbox for Owner/Manager verification.
                          </span>
                        </div>
                      </label>

                      <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        submissionMode === 'automatic' ? 'bg-blue-50/80 border-brand-blue ring-1 ring-brand-blue' : 'bg-white border-surface-border'
                      }`}>
                        <input
                          type="radio"
                          name="submissionMode"
                          value="automatic"
                          checked={submissionMode === 'automatic'}
                          onChange={() => setSubmissionMode('automatic')}
                          className="mt-0.5 text-brand-blue focus:ring-brand-blue"
                        />
                        <div>
                          <span className="font-bold text-xs text-navy-900 block">Create lead automatically</span>
                          <span className="text-[10px] text-content-secondary block mt-0.5">
                            Submissions immediately create active leads in your workspace.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <Input
                    label="Public Form Title *"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />

                  <div>
                    <label className="block text-xs font-semibold text-content-primary mb-1">
                      Form Header Description
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                    />
                  </div>

                  {/* Standard Toggles */}
                  <div className="pt-2 border-t border-surface-border space-y-3">
                    <span className="font-bold text-xs text-navy-900 block">Standard Optional Fields</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <label className="flex items-center gap-2 p-3 bg-slate-50/60 rounded-xl border border-surface-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showEmail}
                          onChange={(e) => setShowEmail(e.target.checked)}
                          className="rounded text-brand-blue"
                        />
                        <span>Show Email</span>
                      </label>
                      <label className="flex items-center gap-2 p-3 bg-slate-50/60 rounded-xl border border-surface-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showSource}
                          onChange={(e) => setShowSource(e.target.checked)}
                          className="rounded text-brand-blue"
                        />
                        <span>Show Channel / Source</span>
                      </label>
                      <label className="flex items-center gap-2 p-3 bg-slate-50/60 rounded-xl border border-surface-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showBudget}
                          onChange={(e) => setShowBudget(e.target.checked)}
                          className="rounded text-brand-blue"
                        />
                        <span>Show Budget</span>
                      </label>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Custom Questions Builder Card */}
              <Card
                title="Controlled Custom Questions Builder"
                subtitle="Add up to 10 industry-tailored questions to collect specific buyer preferences"
              >
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-surface-border">
                  <span className="text-xs font-bold text-navy-900">Custom Questions List</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={applyTemplateSuggestions}
                      icon={<Sparkles className="w-3.5 h-3.5 text-brand-amber" />}
                    >
                      Template Suggestions
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openAddFieldModal}
                      icon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Add Question
                    </Button>
                  </div>
                </div>
                {customFields.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-surface-border space-y-2">
                    <Layers className="w-8 h-8 text-content-muted mx-auto" />
                    <p className="text-xs text-content-secondary font-medium">No custom questions added yet.</p>
                    <Button type="button" variant="outline" size="sm" onClick={applyTemplateSuggestions}>
                      Apply {activeTemplate.title} Template Questions
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {customFields.map((field, idx) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between p-3 bg-white border border-surface-border/80 rounded-xl shadow-2xs hover:border-brand-blue/40 transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-[10px] font-extrabold text-content-muted w-5 text-center">#{idx + 1}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-navy-900 truncate">{field.label}</span>
                              {field.required && <Badge variant="critical" size="sm">REQUIRED</Badge>}
                              <Badge variant="neutral" size="sm" className="uppercase font-mono text-[9px]">
                                {field.type.replace('_', ' ')}
                              </Badge>
                            </div>
                            {field.options && field.options.length > 0 && (
                              <p className="text-[10px] text-content-secondary truncate mt-0.5">
                                Options: {field.options.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveField(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-content-muted hover:text-navy-900 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveField(idx, 'down')}
                            disabled={idx === customFields.length - 1}
                            className="p-1 text-content-muted hover:text-navy-900 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditFieldModal(field)}
                            className="p-1 text-content-muted hover:text-brand-blue"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(field.id)}
                            className="p-1 text-content-muted hover:text-status-critical"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Form Lifecycle Actions Card */}
              {isOwnerOrManager && (
                <Card title="Form Lifecycle Management" subtitle="Archive or move public lead form to Trash">
                  <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 border border-surface-border rounded-xl">
                    <div>
                      <span className="font-bold text-xs text-navy-900 block">Archive or Trash Form</span>
                      <span className="text-[11px] text-content-secondary block mt-0.5">
                        Archived or deleted forms stop accepting public submissions immediately.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchiveForm(formConfig.id)}
                        icon={<Archive className="w-3.5 h-3.5 text-brand-blue" />}
                      >
                        Archive Form
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSoftDeleteForm(formConfig.id)}
                        icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                      >
                        Move to Trash
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Right Sidebar Info */}
            <div className="space-y-6">
              <Card title="Public Form Details">
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-surface-border/50">
                    <span className="text-content-secondary">Form Slug:</span>
                    <span className="font-bold text-navy-900 font-mono">/forms/{formConfig.slug}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-surface-border/50">
                    <span className="text-content-secondary">Total Submissions:</span>
                    <span className="font-bold text-navy-900">{formConfig.submission_count}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-surface-border/50">
                    <span className="text-content-secondary">Handling Mode:</span>
                    <Badge variant={formConfig.submission_mode === 'review' ? 'warning' : 'blue'} size="sm">
                      {(formConfig.submission_mode || 'review').toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-content-secondary">Created Date:</span>
                    <span className="font-medium text-navy-900">{new Date(formConfig.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>

              {isOwnerOrManager && (
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={saving}
                  icon={<Save className="w-4 h-4" />}
                  className="w-full justify-center font-bold"
                >
                  Save Configuration
                </Button>
              )}
            </div>
          </div>
        </form>
      ) : activeTab === 'archived' ? (
        /* ARCHIVED TAB */
        formsList.length === 0 ? (
          <Card>
            <EmptyState
              title="No archived lead forms"
              description="Lead forms archived from active settings will appear here."
              icon={<Archive className="w-8 h-8 text-brand-blue" />}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {formsList.map((form) => (
              <div
                key={form.id}
                className="bg-white border border-surface-border rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-base text-navy-900">{form.title}</span>
                    <Badge variant="blue" size="sm">ARCHIVED</Badge>
                  </div>
                  <p className="text-xs text-content-secondary">Public Slug: <code className="font-mono text-navy-900">/forms/{form.slug}</code></p>
                  <p className="text-[11px] text-content-muted">
                    Archived on: {form.archived_at ? new Date(form.archived_at).toLocaleString() : '—'} • Submissions: {form.submission_count}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreArchivedForm(form.id)}
                    icon={<RotateCcw className="w-3.5 h-3.5 text-brand-blue" />}
                  >
                    Restore Form
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSoftDeleteForm(form.id)}
                    icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                  >
                    Move to Trash
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* DELETED TAB (TRASH) */
        formsList.length === 0 ? (
          <Card>
            <EmptyState
              title="Form Trash is empty"
              description="No deleted lead forms currently exist in Trash."
              icon={<Trash2 className="w-8 h-8 text-content-muted" />}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {formsList.map((form) => (
              <div
                key={form.id}
                className="bg-white border border-surface-border rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-base text-navy-900">{form.title}</span>
                    <Badge variant="critical" size="sm">DELETED</Badge>
                  </div>
                  <p className="text-xs text-content-secondary">Public Slug: <code className="font-mono text-navy-900">/forms/{form.slug}</code></p>
                  <p className="text-[11px] text-content-muted">
                    Deleted on: {form.deleted_at ? new Date(form.deleted_at).toLocaleString() : '—'} • Submissions: {form.submission_count}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreDeletedForm(form.id)}
                    icon={<RotateCcw className="w-3.5 h-3.5 text-brand-blue" />}
                  >
                    Restore Form
                  </Button>

                  {isOwner && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleOpenPermDeleteModal(form)}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Permanently Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* PERMANENT DELETE FORM MODAL */}
      {isPermModalOpen && permDeleteForm && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-surface-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
              <h3 className="font-heading font-bold text-base text-status-critical flex items-center gap-2">
                <AlertOctagon className="w-5 h-5" /> Permanently Delete Form
              </h3>
              <button onClick={() => setIsPermModalOpen(false)} className="text-slate-400 hover:text-navy-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {permDeleteForm.submission_count > 0 ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-status-critical font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>This form has submission history ({permDeleteForm.submission_count} submissions) and cannot be permanently deleted.</span>
                </div>
                <p className="text-content-secondary">
                  To protect client records, forms with historical submissions remain safely preserved in Trash.
                </p>
                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setIsPermModalOpen(false)}>Close</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecutePermanentDelete} className="space-y-4 text-xs">
                <p className="text-navy-900 font-semibold">
                  Permanently delete <span className="font-bold text-status-critical">{permDeleteForm.title}</span>?
                </p>
                <p className="text-content-secondary">
                  This action is irreversible. The form configuration will be permanently removed.
                </p>

                <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1.5">
                  <label className="block text-[11px] font-bold text-status-critical uppercase tracking-wider">
                    Type DELETE to confirm:
                  </label>
                  <input
                    type="text"
                    placeholder="DELETE"
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-red-300 text-xs font-mono font-bold text-navy-900 uppercase"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsPermModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    size="sm"
                    disabled={confirmationInput.trim().toUpperCase() !== 'DELETE' || permDeleting}
                    icon={<Trash2 className="w-4 h-4" />}
                  >
                    {permDeleting ? 'Deleting...' : 'Permanently Delete'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM FIELD BUILDER MODAL */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-surface-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-surface-border">
              <h3 className="font-heading font-bold text-base text-navy-900">
                {editingFieldId ? 'Edit Custom Question' : 'Add Custom Question'}
              </h3>
              <button onClick={() => setIsFieldModalOpen(false)} className="text-slate-400 hover:text-navy-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomField} className="space-y-4 text-xs">
              <Input
                label="Question Label *"
                placeholder="e.g. Desired Location / Move-in Date"
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
                required
              />

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">Field Type *</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border text-xs text-navy-900 bg-white focus:outline-none"
                >
                  <option value="short_text">Short Text</option>
                  <option value="long_text">Long Paragraph</option>
                  <option value="select">Dropdown Select</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="checkbox">Checkbox (Yes/No)</option>
                </select>
              </div>

              {fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Dropdown Options (One per line or comma-separated) *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Downtown, Suburbs, Waterfront"
                    value={fieldOptionsText}
                    onChange={(e) => setFieldOptionsText(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 focus:outline-none"
                  />
                </div>
              )}

              <Input
                label="Placeholder (Optional)"
                placeholder="e.g. Select your preferred area"
                value={fieldPlaceholder}
                onChange={(e) => setFieldPlaceholder(e.target.value)}
              />

              <Input
                label="Help Text (Optional)"
                placeholder="e.g. Choose the primary location for your search"
                value={fieldHelpText}
                onChange={(e) => setFieldHelpText(e.target.value)}
              />

              <label className="flex items-center gap-2 font-semibold text-navy-900 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={fieldRequired}
                  onChange={(e) => setFieldRequired(e.target.checked)}
                  className="rounded text-brand-blue"
                />
                <span>Required Field</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-surface-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsFieldModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  {editingFieldId ? 'Update Question' : 'Add Question'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
