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
import { Archive, RotateCcw, Trash2, Search, Phone, Mail, Calendar, Lock } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export const ArchivedLeadsPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [archivedLeads, setArchivedLeads] = useState<Lead[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const loadArchived = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const data = await leadsApi.getArchivedLeads(currentWorkspace.id)
      setArchivedLeads(data)
    } catch (err: unknown) {
      console.error('Error loading archived leads:', err)
      const msg = err instanceof Error ? err.message : 'Failed to load archived leads'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadArchived()
    })
  }, [loadArchived])

  const handleRestore = async (leadId: string) => {
    const success = await leadsApi.restoreArchivedLead(leadId)
    if (success) {
      await loadArchived()
    }
  }

  const handleMoveToTrash = async (leadId: string) => {
    if (!confirm('Move this archived lead to Trash?')) return
    const success = await leadsApi.softDeleteLead(leadId, 'Archived lead moved to trash')
    if (success) {
      await loadArchived()
    }
  }

  const filtered = archivedLeads.filter((l) => {
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
            Only Workspace Owners and Managers can access Archived Leads.
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
            <Archive className="w-7 h-7 text-brand-blue" />
            Archived Leads
          </h1>
          <p className="text-sm text-content-secondary mt-1">
            Archived leads are preserved with full activity notes but removed from active operational views.
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
        <Card><LoadingState label="Loading archived leads..." /></Card>
      ) : error ? (
        <Card><div className="p-4 bg-red-50 text-status-critical text-xs rounded-xl">{error}</div></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="No archived leads"
            description="Leads archived from the leads list or detail page will be safely preserved here."
            icon={<Archive className="w-8 h-8 text-brand-blue" />}
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
                  <Badge variant="blue" size="sm">ARCHIVED</Badge>
                  <span className="text-[11px] text-content-secondary flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-content-muted" />
                    Archived on: {(lead as unknown as { archived_at?: string }).archived_at ? new Date((lead as unknown as { archived_at: string }).archived_at).toLocaleDateString() : '—'}
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
                  <span>Previous Stage: {lead.stage}</span>
                </div>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMoveToTrash(lead.id)}
                  icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                >
                  Move to Trash
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
