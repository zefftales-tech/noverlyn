import React, { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Badge } from '../ui/Badge'
import { useWorkspace } from '../../hooks/useWorkspace'
import { communicationsApi, type MessageTemplate } from '../../lib/communicationsApi'
import { renderTemplateVariables } from '../../lib/whatsapp'
import { Plus, Edit, Trash2, Sparkles, Check, AlertCircle, FileText } from 'lucide-react'

export interface TemplateManagementModalProps {
  isOpen: boolean
  onClose: () => void
}

export const TemplateManagementModal: React.FC<TemplateManagementModalProps> = ({ isOpen, onClose }) => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit / Create State
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('general')
  const [content, setContent] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const categories = [
    { value: 'general', label: 'General' },
    { value: 'first_contact', label: 'First Contact' },
    { value: 'follow_up', label: 'Follow-up' },
    { value: 'property_details', label: 'Property Details' },
    { value: 'viewing_confirmation', label: 'Viewing Confirmation' },
    { value: 'no_response', label: 'No Response' },
    { value: 'closing', label: 'Closing Deal' },
  ]

  const loadTemplates = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const data = await communicationsApi.getMessageTemplates(currentWorkspace.id)
      setTemplates(data)
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    if (!isOpen || !currentWorkspace) return
    const timer = setTimeout(() => {
      loadTemplates()
      setIsEditing(false)
      setEditingId(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [isOpen, currentWorkspace, loadTemplates])

  const handleStartCreate = () => {
    setEditingId(null)
    setName('')
    setCategory('general')
    setContent('')
    setIsActive(true)
    setIsEditing(true)
  }

  const handleStartEdit = (t: MessageTemplate) => {
    setEditingId(t.id)
    setName(t.name)
    setCategory(t.category)
    setContent(t.content)
    setIsActive(t.is_active)
    setIsEditing(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace) return
    if (!name.trim() || !content.trim()) {
      setError('Template name and message content are required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (editingId) {
        await communicationsApi.updateTemplate(editingId, name.trim(), category, content.trim(), isActive)
      } else {
        await communicationsApi.createTemplate(currentWorkspace.id, name.trim(), category, content.trim())
      }

      await loadTemplates()
      setIsEditing(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save template'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this message template?')) return
    try {
      await communicationsApi.deleteTemplate(id)
      await loadTemplates()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  const previewRendered = renderTemplateVariables(content, {
    leadName: 'John Smith',
    agentName: 'Sarah Jenkins',
    workspaceName: currentWorkspace?.name || 'Noverlyn',
    propertyRequirement: '3-Bed Villa in Downtown',
    nextFollowUpDate: 'Tomorrow at 10:00 AM',
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="WhatsApp Message Templates"
      subtitle={`Manage reusable message templates for ${currentWorkspace?.name}`}
      maxWidth="lg"
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isEditing ? (
          <form onSubmit={handleSave} className="p-4 bg-slate-50 border border-surface-border rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-heading font-bold text-sm text-navy-900">
                {editingId ? 'Edit Template' : 'Create New Message Template'}
              </h4>
              <Button variant="ghost" size="sm" type="button" onClick={() => setIsEditing(false)}>
                Back to Templates
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Template Name *"
                placeholder="e.g. Initial Inbound Greeting"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Select
                label="Category"
                options={categories}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">
                Template Content *
              </label>
              <textarea
                rows={4}
                placeholder="Type your message content. Use variables like {{lead_name}}, {{agent_name}}, {{property_requirement}}, {{next_follow_up_date}}"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-3 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                required
              />
            </div>

            {/* Variable cheat sheet */}
            <div className="p-2.5 bg-white border border-surface-border/60 rounded-lg space-y-1">
              <span className="font-bold text-[11px] text-navy-900 block">Available Dynamic Variables:</span>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-content-secondary font-mono">
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-blue font-bold">{"{{lead_name}}"}</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-blue font-bold">{"{{agent_name}}"}</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-blue font-bold">{"{{workspace_name}}"}</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-blue font-bold">{"{{property_requirement}}"}</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-blue font-bold">{"{{next_follow_up_date}}"}</span>
              </div>
            </div>

            {/* Live Preview */}
            {content && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-1">
                <span className="font-bold text-[11px] text-emerald-800 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Live Render Preview:
                </span>
                <p className="text-xs text-navy-900 bg-white p-2.5 rounded-lg border border-emerald-200 shadow-2xs whitespace-pre-wrap">
                  {previewRendered}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
              <Button variant="outline" size="sm" type="button" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" isLoading={saving} icon={<Check className="w-4 h-4" />}>
                Save Template
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-navy-900 text-sm">
                Active Templates ({templates.length})
              </span>
              {isOwnerOrManager && (
                <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleStartCreate}>
                  Create Template
                </Button>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-center text-content-secondary">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="py-8 text-center text-content-secondary bg-slate-50 border border-dashed rounded-xl space-y-2">
                <FileText className="w-6 h-6 text-content-muted mx-auto" />
                <p className="font-bold text-navy-900">No message templates yet</p>
                <p className="text-[11px]">Create templates for instant WhatsApp follow-ups.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {templates.map((t) => (
                  <div key={t.id} className="p-3.5 bg-slate-50 border border-surface-border rounded-xl space-y-2 hover:bg-slate-100/80 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-navy-900">{t.name}</span>
                        <Badge variant="blue" className="uppercase text-[10px]">
                          {t.category.replace('_', ' ')}
                        </Badge>
                      </div>
                      {isOwnerOrManager && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(t)}
                            className="p-1 rounded text-content-secondary hover:text-navy-900 hover:bg-white transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-1 rounded text-content-secondary hover:text-status-critical hover:bg-white transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-content-secondary bg-white p-2.5 rounded-lg border border-surface-border/60 whitespace-pre-wrap">
                      {t.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
