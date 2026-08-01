import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingState } from '../../components/ui/LoadingState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { leadsApi } from '../../lib/leadsApi'
import type { Database } from '../../types/database.types'
import { Trash2, RotateCcw, Search, Phone, Mail, Calendar, AlertOctagon, X, Lock } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export const LeadTrashPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [trashLeads, setTrashLeads] = useState<Lead[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Permanent Delete Modal State
  const [permDeleteLead, setPermDeleteLead] = useState<Lead | null>(null)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [isPermModalOpen, setIsPermModalOpen] = useState(false)
  const [permDeleting, setPermDeleting] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'
  const isOwner = currentRole === 'owner'

  const loadTrash = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const data = await leadsApi.getTrashLeads(currentWorkspace.id)
      setTrashLeads(data)
    } catch (err: unknown) {
      console.error('Error loading trash leads:', err)
      const msg = err instanceof Error ? err.message : 'Failed to load trash leads'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadTrash()
    })
  }, [loadTrash])

  const handleRestore = async (leadId: string) => {
    const success = await leadsApi.restoreDeletedLead(leadId)
    if (success) {
      await loadTrash()
    }
  }

  const handleOpenPermDeleteModal = (lead: Lead) => {
    setPermDeleteLead(lead)
    setConfirmationInput('')
    setIsPermModalOpen(true)
  }

  const handleExecutePermanentDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!permDeleteLead) return

    if (confirmationInput.trim().toUpperCase() !== 'DELETE') {
      alert('Confirmation text mismatch. Type DELETE to confirm.')
      return
    }

    setPermDeleting(true)
    try {
      const success = await leadsApi.permanentlyDeleteLead(permDeleteLead.id, 'DELETE')
      if (success) {
        setIsPermModalOpen(false)
        await loadTrash()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to permanently delete lead')
    } finally {
      setPermDeleting(false)
    }
  }

  const filtered = trashLeads.filter((l) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      l.full_name.toLowerCase().includes(q) ||
      l.phone.toLowerCase().includes(q) ||
      (l.email && l.email.toLowerCase().includes(q))
    )
  })

  if (!isOwnerOrManager) {
    return (
      <Card>
        <div className="py-12 text-center space-y-3">
          <Lock className="w-8 h-8 text-content-muted mx-auto" />
          <h3 className="font-heading font-bold text-lg text-navy-900">Manager Access Required</h3>
          <p className="text-xs text-content-secondary max-w-md mx-auto">
            Only Workspace Owners and Managers can access Lead Trash.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="pb-3 border-b border-surface-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight flex items-center gap-2.5">
            <Trash2 className="w-7 h-7 text-status-critical" />
            Lead Trash
          </h1>
          <p className="text-sm text-content-secondary mt-1">
            Leads in Trash can be restored by Managers & Owners. Only Workspace Owners can permanently delete leads.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder="Search by name, phone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-content-muted" />}
          />
        </div>
      </div>

      {loading ? (
        <Card><LoadingState label="Loading trash leads..." /></Card>
      ) : error ? (
        <Card><div className="p-4 bg-red-50 text-status-critical text-xs rounded-xl">{error}</div></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="Trash is empty"
            description="No deleted leads currently exist in Trash."
            icon={<Trash2 className="w-8 h-8 text-content-muted" />}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              className="bg-white border border-surface-border/80 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-saas transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-bold text-base text-navy-900">{lead.full_name}</span>
                  <Badge variant="critical" size="sm">DELETED</Badge>
                  <span className="text-[11px] text-content-secondary flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-content-muted" />
                    Deleted: {(lead as unknown as { deleted_at?: string }).deleted_at ? new Date((lead as unknown as { deleted_at: string }).deleted_at).toLocaleDateString() : '—'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-content-secondary flex-wrap">
                  <span className="flex items-center gap-1 font-semibold text-navy-900">
                    <Phone className="w-3.5 h-3.5 text-content-muted" /> {lead.phone}
                  </span>
                  {lead.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-content-muted" /> {lead.email}
                    </span>
                  )}
                  <span>Source: {lead.source || '—'}</span>
                  {(lead as unknown as { previous_stage_key?: string }).previous_stage_key && (
                    <span>Previous Stage: {(lead as unknown as { previous_stage_key: string }).previous_stage_key}</span>
                  )}
                </div>

                {(lead as unknown as { deletion_reason?: string }).deletion_reason && (
                  <p className="text-xs text-status-critical bg-red-50/70 px-3 py-1.5 rounded-lg border border-red-100 italic">
                    Reason: {(lead as unknown as { deletion_reason: string }).deletion_reason}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(lead.id)}
                  icon={<RotateCcw className="w-3.5 h-3.5 text-brand-blue" />}
                >
                  Restore Lead
                </Button>

                {isOwner && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleOpenPermDeleteModal(lead)}
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Permanently Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PERMANENT DELETE MODAL */}
      {isPermModalOpen && permDeleteLead && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-surface-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
              <h3 className="font-heading font-bold text-base text-status-critical flex items-center gap-2">
                <AlertOctagon className="w-5 h-5" /> Permanently Delete Lead
              </h3>
              <button onClick={() => setIsPermModalOpen(false)} className="text-slate-400 hover:text-navy-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-navy-900 leading-relaxed font-semibold">
                Permanently delete <span className="font-bold text-status-critical">{permDeleteLead.full_name}</span>?
              </p>
              <p className="text-content-secondary">
                This action is irreversible. All activity logs, notes, and records linked to this lead will be removed.
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
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setIsPermModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={confirmationInput.trim().toUpperCase() !== 'DELETE' || permDeleting}
                onClick={handleExecutePermanentDelete}
                icon={<Trash2 className="w-4 h-4" />}
              >
                {permDeleting ? 'Deleting Permanently...' : 'Permanently Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
