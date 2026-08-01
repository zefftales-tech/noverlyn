import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingState } from '../../components/ui/LoadingState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { formsApi, type LeadFormConfig, type CustomFieldDefinition, type CustomFieldType } from '../../lib/formsApi'
import { getTemplateForBusinessType } from '../../lib/templates'

import {
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Save,
  Lock,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit2,
  Sparkles,
  Layers,
  X
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
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])

  // Custom Field Modal/Editor State
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldType>('short_text')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldPlaceholder, setFieldPlaceholder] = useState('')
  const [fieldHelpText, setFieldHelpText] = useState('')
  const [fieldOptionsText, setFieldOptionsText] = useState('') // comma or line separated

  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'
  const activeTemplate = getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type)

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
        setCustomFields(data.custom_fields || [])
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

  // Open Field Builder Modal
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
      // Edit existing
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
      // Add new
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

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setCustomFields((prev) => {
      const next = [...prev]
      const temp = next[index - 1]
      next[index - 1] = next[index]
      next[index] = temp
      return next
    })
  }

  const handleMoveDown = (index: number) => {
    if (index === customFields.length - 1) return
    setCustomFields((prev) => {
      const next = [...prev]
      const temp = next[index + 1]
      next[index + 1] = next[index]
      next[index] = temp
      return next
    })
  }

  // Suggested Vertical Field Templates
  const handleAddSuggestedField = (label: string, type: CustomFieldType, options?: string[]) => {
    if (customFields.length >= 10) {
      alert('Maximum 10 custom fields allowed.')
      return
    }
    const generatedKey = label.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    if (customFields.some((f) => f.key === generatedKey)) {
      alert(`Field "${label}" is already added.`)
      return
    }

    const newField: CustomFieldDefinition = {
      id: `cf_${Date.now()}`,
      key: generatedKey,
      label,
      type,
      required: false,
      options,
      display_order: customFields.length + 1,
      is_active: true,
    }
    setCustomFields((prev) => [...prev, newField])
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
            Configure public inquiry form settings and custom questions for your workspace.
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
              Only Workspace Owners and Managers can configure Lead Capture Forms and custom questions.
            </p>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {error && (
            <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-status-success flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form Settings & Custom Builder */}
            <div className="lg:col-span-2 space-y-6">
              {/* General Form Card */}
              <Card title="Public Form Header Settings" subtitle="Title, description, and standard field toggles">
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

                  <Input
                    label="Public Form Title *"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Connect with Our Sales Team"
                  />

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

                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-content-secondary">
                      Standard Optional Fields
                    </h4>

                    <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-surface-border/40 rounded-xl">
                      <span className="text-xs font-semibold text-navy-900">Show Email Address Field</span>
                      <input
                        type="checkbox"
                        checked={showEmail}
                        onChange={(e) => setShowEmail(e.target.checked)}
                        className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-surface-border/40 rounded-xl">
                      <span className="text-xs font-semibold text-navy-900">Show Source / Channel Field</span>
                      <input
                        type="checkbox"
                        checked={showSource}
                        onChange={(e) => setShowSource(e.target.checked)}
                        className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                      />
                    </div>

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

              {/* Controlled Custom Fields Builder Card */}
              <Card
                title={`Controlled Custom Fields (${customFields.length}/10)`}
                subtitle="Add custom questions to gather specific client information."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openAddFieldModal}
                    icon={<Plus className="w-3.5 h-3.5 text-brand-blue" />}
                  >
                    Add Custom Field
                  </Button>
                }
              >
                {/* Vertical Suggested Fields Banner */}
                <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2 mb-4">
                  <div className="flex items-center gap-2 font-bold text-xs text-navy-900">
                    <Sparkles className="w-4 h-4 text-brand-blue" />
                    <span>Suggested Questions for {activeTemplate.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {activeTemplate.businessType === 'real_estate' && (
                      <>
                        <button type="button" onClick={() => handleAddSuggestedField('Property Type', 'select', ['Apartment', 'Villa', 'Commercial', 'Plot'])} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Property Type</button>
                        <button type="button" onClick={() => handleAddSuggestedField('Preferred Location', 'short_text')} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Preferred Location</button>
                        <button type="button" onClick={() => handleAddSuggestedField('Bedrooms', 'select', ['1 BHK', '2 BHK', '3 BHK', '4+ BHK'])} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Bedrooms</button>
                      </>
                    )}
                    {activeTemplate.businessType === 'agency' && (
                      <>
                        <button type="button" onClick={() => handleAddSuggestedField('Service Needed', 'select', ['Web Development', 'Digital Marketing', 'Branding', 'SEO'])} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Service Needed</button>
                        <button type="button" onClick={() => handleAddSuggestedField('Company Name', 'short_text')} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Company Name</button>
                        <button type="button" onClick={() => handleAddSuggestedField('Target Launch Date', 'date')} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Target Date</button>
                      </>
                    )}
                    {activeTemplate.businessType === 'home_services' && (
                      <>
                        <button type="button" onClick={() => handleAddSuggestedField('Service Type', 'select', ['Plumbing', 'HVAC / Cooling', 'Electrical', 'Cleaning'])} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Service Type</button>
                        <button type="button" onClick={() => handleAddSuggestedField('Service Address / Area', 'short_text')} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Service Area</button>
                      </>
                    )}
                    {activeTemplate.businessType === 'general' && (
                      <>
                        <button type="button" onClick={() => handleAddSuggestedField('Inquiry Type', 'select', ['General Support', 'Partnership', 'Sales', 'Feedback'])} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Inquiry Type</button>
                        <button type="button" onClick={() => handleAddSuggestedField('Company Name', 'short_text')} className="text-[11px] font-semibold bg-white border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100/70 text-navy-900">+ Company Name</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Custom Fields List */}
                {customFields.length === 0 ? (
                  <div className="p-6 text-center text-xs text-content-secondary border border-dashed border-surface-border rounded-xl space-y-1">
                    <Layers className="w-6 h-6 text-content-muted mx-auto" />
                    <p className="font-bold text-navy-900">No Custom Questions Added</p>
                    <p className="text-[11px]">Click "Add Custom Field" or use suggested questions above.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {customFields.map((field, idx) => (
                      <div
                        key={field.id}
                        className="p-3.5 bg-slate-50 border border-surface-border/70 rounded-xl flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-navy-900 truncate">{field.label}</span>
                            <Badge variant="blue" size="sm">{field.type}</Badge>
                            {field.required && <Badge variant="critical" size="sm">Required</Badge>}
                          </div>
                          {field.options && field.options.length > 0 && (
                            <p className="text-[11px] text-content-secondary mt-0.5 truncate">
                              Options: {field.options.join(', ')}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            className="p-1 rounded text-slate-400 hover:text-navy-900 disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === customFields.length - 1}
                            className="p-1 rounded text-slate-400 hover:text-navy-900 disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditFieldModal(field)}
                            className="p-1.5 rounded-lg bg-white border border-surface-border text-navy-900 hover:bg-slate-100"
                            title="Edit Field"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(field.id)}
                            className="p-1.5 rounded-lg bg-white border border-red-200 text-status-critical hover:bg-red-50"
                            title="Remove Field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" size="md" disabled={saving} icon={<Save className="w-4 h-4" />}>
                  {saving ? 'Saving Form Settings...' : 'Save All Form Settings'}
                </Button>
              </div>
            </div>

            {/* Sidebar Integration Card */}
            <div className="space-y-6">
              <Card title="Public Link & Ingestion" subtitle="Integration summary for your website">
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-surface-border/60 space-y-1">
                    <span className="text-[10px] font-bold text-content-secondary uppercase tracking-wider block">Form Public Link</span>
                    <p className="text-xs font-mono text-navy-900 break-all">{publicUrl}</p>
                  </div>

                  <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-blue-950">Total Submissions</span>
                      <Badge variant="blue" className="font-bold">{formConfig?.submission_count || 0}</Badge>
                    </div>
                    <p className="text-content-secondary text-[11px]">
                      Inquiries created via public forms are automatically routed to your workspace's first active stage.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </form>
      )}

      {/* Field Editor Modal */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-surface-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
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
                placeholder="e.g. Preferred Location"
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
                required
              />

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1.5">Question Type</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs text-navy-900 bg-white"
                >
                  <option value="short_text">Short Text (Single line)</option>
                  <option value="long_text">Long Text (Multi-line area)</option>
                  <option value="number">Numeric Input</option>
                  <option value="select">Dropdown Select</option>
                  <option value="date">Date Picker</option>
                  <option value="checkbox">Single Checkbox (Yes/No)</option>
                </select>
              </div>

              {fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-semibold text-content-primary mb-1">
                    Select Options (One option per line) *
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                    value={fieldOptionsText}
                    onChange={(e) => setFieldOptionsText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs text-navy-900 font-mono"
                  />
                  <p className="text-[10px] text-content-muted mt-1">Up to 20 options supported.</p>
                </div>
              )}

              <Input
                label="Placeholder Text (Optional)"
                placeholder="e.g. Select your preferred area..."
                value={fieldPlaceholder}
                onChange={(e) => setFieldPlaceholder(e.target.value)}
              />

              <Input
                label="Help Text (Optional)"
                placeholder="e.g. Choose from the available options"
                value={fieldHelpText}
                onChange={(e) => setFieldHelpText(e.target.value)}
              />

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border rounded-xl">
                <span className="font-bold text-navy-900">Required Question</span>
                <input
                  type="checkbox"
                  checked={fieldRequired}
                  onChange={(e) => setFieldRequired(e.target.checked)}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
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
