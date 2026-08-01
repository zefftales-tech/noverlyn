import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadingState } from '../../components/ui/LoadingState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { supabase } from '../../lib/supabase'
import { leadsApi } from '../../lib/leadsApi'
import type { Database, LeadStage, LeadPriority, LeadStatus } from '../../types/database.types'

import { AddLeadModal } from '../../components/leads/AddLeadModal'
import { LogContactModal } from '../../components/leads/LogContactModal'
import { ScheduleFollowUpModal } from '../../components/leads/ScheduleFollowUpModal'

import {
  List,
  Search,
  Plus,
  Phone,
  ArrowRight,
  Filter,
  PhoneCall,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Archive,
  Trash2,
  X,
  CheckCircle2
} from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export const AllLeadsPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const navigate = useNavigate()

  const [leads, setLeads] = useState<Lead[]>([])
  const [membersMap, setMembersMap] = useState<Record<string, string>>({})
  const [membersList, setMembersList] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  // Pagination State
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Multi-Select & Bulk State
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAction, setBulkAction] = useState<string>('')
  const [bulkAgentId, setBulkAgentId] = useState<string>('')
  const [bulkPriority, setBulkPriority] = useState<LeadPriority>('warm')
  const [bulkStage, setBulkStage] = useState<LeadStage>('contacted')
  const [bulkLoading, setBulkLoading] = useState(false)

  // Trash Confirmation Modal State
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false)
  const [trashTargets, setTrashTargets] = useState<Lead[]>([])
  const [trashReason, setTrashReason] = useState('')
  const [trashing, setTrashing] = useState(false)

  // Action Modals
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [isLogContactOpen, setIsLogContactOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 4000)
  }

  const fetchLeads = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const res = await leadsApi.getLeads(currentWorkspace.id, {
        page,
        pageSize,
        searchQuery,
        stageFilter: stageFilter as LeadStage | 'all',
        priorityFilter: priorityFilter as LeadPriority | 'all',
        statusFilter: statusFilter as LeadStatus | 'all',
      })

      let fetchedLeads = res.data
      if (agentFilter === 'unassigned') {
        fetchedLeads = fetchedLeads.filter((l) => !l.assigned_to)
      } else if (agentFilter !== 'all') {
        fetchedLeads = fetchedLeads.filter((l) => l.assigned_to === agentFilter)
      }

      if (sourceFilter !== 'all') {
        fetchedLeads = fetchedLeads.filter((l) => l.source === sourceFilter)
      }

      setLeads(fetchedLeads)
      setTotalCount(res.totalCount)
      setTotalPages(res.totalPages)

      // Members map
      if (supabase) {
        const { data: mems } = await supabase
          .from('workspace_members')
          .select('user_id, profile:profiles(full_name)')
          .eq('workspace_id', currentWorkspace.id)
          .eq('status', 'active')

        const rawMems = (mems as unknown) as Array<{ user_id: string; profile: { full_name: string } | null }> | null
        const map: Record<string, string> = {}
        const list: Array<{ userId: string; fullName: string }> = []
        if (rawMems) {
          rawMems.forEach((m) => {
            const prof = m.profile
            if (prof?.full_name) {
              map[m.user_id] = prof.full_name
              list.push({ userId: m.user_id, fullName: prof.full_name })
            }
          })
        }
        setMembersMap(map)
        setMembersList(list)
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch leads'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, page, pageSize, searchQuery, stageFilter, priorityFilter, statusFilter, agentFilter, sourceFilter])

  useEffect(() => {
    queueMicrotask(() => {
      fetchLeads()
    })

    const handleCreated = () => fetchLeads()
    window.addEventListener('noverlyn:lead_created', handleCreated)
    return () => window.removeEventListener('noverlyn:lead_created', handleCreated)
  }, [fetchLeads])

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(leads.map((l) => l.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  // Open Trash Confirmation Modal for Single Lead
  const handleOpenSingleTrashModal = (lead: Lead) => {
    setTrashTargets([lead])
    setTrashReason('')
    setIsTrashModalOpen(true)
  }

  // Open Trash Confirmation Modal for Bulk Selection
  const handleOpenBulkTrashModal = () => {
    const targets = leads.filter((l) => selectedIds.includes(l.id))
    if (targets.length === 0) return
    setTrashTargets(targets)
    setTrashReason('')
    setIsTrashModalOpen(true)
  }

  // Execute Soft Delete via RPC
  const handleExecuteTrash = async (e: React.FormEvent) => {
    e.preventDefault()
    if (trashTargets.length === 0) return

    setTrashing(true)
    setError(null)

    let successCount = 0
    let failureCount = 0
    let lastError = ''

    for (const lead of trashTargets) {
      try {
        await leadsApi.softDeleteLead(lead.id, trashReason.trim() || undefined)
        successCount++
      } catch (err: unknown) {
        console.error(`Failed to move lead ${lead.id} to trash:`, err)
        failureCount++
        lastError = err instanceof Error ? err.message : 'Deletion failed'
      }
    }

    setTrashing(false)
    setIsTrashModalOpen(false)

    if (successCount > 0) {
      setSelectedIds([])
      await fetchLeads()
      showToast(
        successCount === 1
          ? `Lead "${trashTargets[0].full_name}" moved to Trash.`
          : `${successCount} leads moved to Trash.`
      )
    }

    if (failureCount > 0) {
      setError(`Failed to trash ${failureCount} lead(s): ${lastError}`)
    }
  }

  // Execute Single Lead Archive
  const handleSingleArchive = async (lead: Lead) => {
    if (!confirm(`Archive lead "${lead.full_name}"?`)) return
    try {
      await leadsApi.archiveLead(lead.id)
      await fetchLeads()
      showToast(`Lead "${lead.full_name}" archived.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to archive lead')
    }
  }

  // Execute Bulk Actions
  const handleExecuteBulkAction = async () => {
    if (!currentWorkspace || selectedIds.length === 0 || !bulkAction) return

    if (bulkAction === 'trash') {
      handleOpenBulkTrashModal()
      return
    }

    setBulkLoading(true)
    setError(null)

    try {
      if (bulkAction === 'archive') {
        for (const id of selectedIds) {
          await leadsApi.archiveLead(id)
        }
        showToast(`${selectedIds.length} lead(s) archived.`)
      } else {
        const updates: Record<string, unknown> = {}
        if (bulkAction === 'assign') {
          if (!bulkAgentId) {
            setError('Please select an active agent to assign')
            setBulkLoading(false)
            return
          }
          updates.assigned_to = bulkAgentId
        } else if (bulkAction === 'priority') {
          updates.priority = bulkPriority
        } else if (bulkAction === 'stage') {
          updates.stage = bulkStage
        }
        await leadsApi.bulkUpdateLeads(currentWorkspace.id, selectedIds, updates)
        showToast(`Updated ${selectedIds.length} lead(s).`)
      }

      setSelectedIds([])
      setBulkAction('')
      await fetchLeads()
    } catch (err: unknown) {
      console.error('[Bulk Action Error]', err)
      setError(err instanceof Error ? err.message : 'Bulk operation failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const stageOptions = [
    { value: 'all', label: 'All Stages' },
    { value: 'new', label: 'New Lead' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'property_shared', label: 'Property Shared' },
    { value: 'viewing_scheduled', label: 'Viewing Scheduled' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
  ]

  const priorityOptions = [
    { value: 'all', label: 'All Priorities' },
    { value: 'hot', label: 'HOT' },
    { value: 'warm', label: 'WARM' },
    { value: 'cold', label: 'COLD' },
  ]

  const statusOptions = [
    { value: 'active', label: 'Active Status' },
    { value: 'won', label: 'Won Status' },
    { value: 'lost', label: 'Lost Status' },
    { value: 'archived', label: 'Archived Status' },
    { value: 'all', label: 'All Statuses' },
  ]

  const agentOptions = [
    { value: 'all', label: 'All Agents' },
    { value: 'unassigned', label: 'Unassigned Only' },
    ...membersList.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[150] bg-navy-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-navy-700 animate-in fade-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/leads/trash')} className="text-brand-blue-light hover:text-white underline text-[11px] p-0 h-auto">
            View Trash
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <h1 className="font-heading font-bold text-2xl text-navy-900">All Leads Directory</h1>
          <p className="text-xs text-content-secondary mt-1">
            Master searchable database of client inquiries, budget requirements, and pipeline stages.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isOwnerOrManager && (
            <Button
              variant="outline"
              size="sm"
              icon={<Trash2 className="w-4 h-4 text-status-critical" />}
              onClick={() => navigate('/leads/trash')}
            >
              Open Trash
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
            onClick={() => navigate('/leads/import')}
          >
            Import CSV Leads
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddLeadOpen(true)}
          >
            Add Lead
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* BULK OPERATIONS TOOLBAR */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-brand-blue-light border border-blue-200 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-navy-900 font-bold">
            <CheckSquare className="w-4 h-4 text-brand-blue" />
            <span>{selectedIds.length} lead(s) selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="bg-white border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-navy-900 focus:outline-none"
            >
              <option value="">-- Choose Bulk Action --</option>
              <option value="assign">Bulk Assign Agent</option>
              <option value="priority">Bulk Change Priority</option>
              <option value="stage">Bulk Change Stage</option>
              <option value="archive">Bulk Archive</option>
              <option value="trash">Bulk Move to Trash</option>
            </select>

            {bulkAction === 'assign' && (
              <select
                value={bulkAgentId}
                onChange={(e) => setBulkAgentId(e.target.value)}
                className="bg-white border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-navy-900 focus:outline-none"
              >
                <option value="">-- Select Active Agent --</option>
                {membersList.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            )}

            {bulkAction === 'priority' && (
              <select
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value as LeadPriority)}
                className="bg-white border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-navy-900 focus:outline-none"
              >
                <option value="hot">HOT</option>
                <option value="warm">WARM</option>
                <option value="cold">COLD</option>
              </select>
            )}

            {bulkAction === 'stage' && (
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value as LeadStage)}
                className="bg-white border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-navy-900 focus:outline-none"
              >
                <option value="new">New Lead</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="property_shared">Property Shared</option>
                <option value="viewing_scheduled">Viewing Scheduled</option>
                <option value="negotiation">Negotiation</option>
              </select>
            )}

            <Button
              variant="primary"
              size="sm"
              isLoading={bulkLoading}
              disabled={!bulkAction}
              onClick={handleExecuteBulkAction}
            >
              Apply to Selected ({selectedIds.length})
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <Card padding="sm" className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Search by name, phone (+1...), email, or requirement..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <Select
            options={stageOptions}
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value)
              setPage(1)
            }}
          />
          <Select
            options={agentOptions}
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-surface-border text-xs">
          <span className="flex items-center gap-1 font-semibold text-navy-900">
            <Filter className="w-3.5 h-3.5 text-brand-blue" /> Quick Filters:
          </span>
          <div className="w-36">
            <Select
              options={priorityOptions}
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="w-36">
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <span className="ml-auto text-content-muted">Showing <strong>{leads.length}</strong> of <strong>{totalCount}</strong> leads</span>
        </div>
      </Card>

      {/* Main Leads Table / List */}
      {loading ? (
        <Card><LoadingState label="Loading leads directory..." /></Card>
      ) : leads.length === 0 ? (
        <Card>
          <EmptyState
            title="No leads found"
            description="No lead records matched your selected search query or active filters."
            icon={<List className="w-10 h-10 text-brand-blue" />}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setStageFilter('all')
                  setPriorityFilter('all')
                  setStatusFilter('active')
                  setAgentFilter('all')
                  setSourceFilter('all')
                  setPage(1)
                }}
              >
                Clear Filters
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selectedIds.length === leads.length}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                    />
                  </th>
                  <th className="p-3.5">Lead Name</th>
                  <th className="p-3.5">Stage</th>
                  <th className="p-3.5">Priority</th>
                  <th className="p-3.5">Agent</th>
                  <th className="p-3.5">Budget Range</th>
                  <th className="p-3.5">Est. Value</th>
                  <th className="p-3.5">Next Follow-up</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {leads.map((lead) => {
                  const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date()
                  const isSelected = selectedIds.includes(lead.id)

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-50/80 transition-colors group ${isSelected ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(lead.id)}
                          className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                        />
                      </td>

                      <td className="p-3.5">
                        <div
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          className="font-bold text-navy-900 hover:text-brand-blue cursor-pointer transition-colors"
                        >
                          {lead.full_name}
                        </div>
                        <div className="text-[11px] text-content-secondary flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-content-muted" /> {lead.phone}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <Badge variant="blue" size="sm" className="uppercase font-semibold text-[10px]">
                          {lead.stage.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="p-3.5">
                        <Badge
                          variant={lead.priority === 'hot' ? 'critical' : lead.priority === 'warm' ? 'warning' : 'neutral'}
                          size="sm"
                        >
                          {lead.priority.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="p-3.5 font-medium text-navy-900">
                        {lead.assigned_to ? membersMap[lead.assigned_to] || 'Agent Assigned' : <span className="text-content-muted italic">Unassigned</span>}
                      </td>

                      <td className="p-3.5 font-medium text-navy-900">
                        {lead.budget_min || lead.budget_max
                          ? `${currentWorkspace?.currency || 'USD'} ${lead.budget_min ? lead.budget_min.toLocaleString() : '0'} - ${lead.budget_max ? lead.budget_max.toLocaleString() : 'Max'}`
                          : '—'}
                      </td>

                      <td className="p-3.5 font-semibold text-navy-900">
                        {lead.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${lead.estimated_value.toLocaleString()}` : '—'}
                      </td>

                      <td className="p-3.5">
                        {lead.next_follow_up_at ? (
                          <span className={`inline-flex items-center gap-1 font-medium ${isOverdue ? 'text-status-critical font-bold' : 'text-content-primary'}`}>
                            <Clock className="w-3 h-3" />
                            {new Date(lead.next_follow_up_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            {isOverdue && <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.2 rounded font-bold uppercase ml-1">Overdue</span>}
                          </span>
                        ) : (
                          <span className="text-content-muted italic">None scheduled</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<PhoneCall className="w-3.5 h-3.5 text-emerald-600" />}
                          onClick={() => {
                            setActiveLead(lead)
                            setIsLogContactOpen(true)
                          }}
                          title="Log Contact"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Clock className="w-3.5 h-3.5 text-brand-blue" />}
                          onClick={() => {
                            setActiveLead(lead)
                            setIsScheduleOpen(true)
                          }}
                          title="Schedule Follow-up"
                        />

                        {isOwnerOrManager && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Archive className="w-3.5 h-3.5 text-brand-blue" />}
                              onClick={() => handleSingleArchive(lead)}
                              title="Archive Lead"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                              onClick={() => handleOpenSingleTrashModal(lead)}
                              title="Move to Trash"
                            />
                          </>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          icon={<ArrowRight className="w-3.5 h-3.5" />}
                          onClick={() => navigate(`/leads/${lead.id}`)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Card List */}
          <div className="lg:hidden grid grid-cols-1 gap-3">
            {leads.map((lead) => (
              <div key={lead.id} className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(lead.id)}
                      onChange={() => handleToggleSelect(lead.id)}
                      className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                    />
                    <div>
                      <h3
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className="font-heading font-bold text-sm text-navy-900 hover:text-brand-blue cursor-pointer"
                      >
                        {lead.full_name}
                      </h3>
                      <p className="text-xs text-content-secondary flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-content-muted" /> {lead.phone}
                      </p>
                    </div>
                  </div>
                  <Badge variant={lead.priority === 'hot' ? 'critical' : lead.priority === 'warm' ? 'warning' : 'neutral'}>
                    {lead.priority.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-surface-border">
                  <span className="text-content-muted">Stage: <strong className="text-navy-900 uppercase text-[10px]">{lead.stage.replace('_', ' ')}</strong></span>
                  <span className="text-content-muted">Agent: <strong className="text-navy-900">{lead.assigned_to ? membersMap[lead.assigned_to] || 'Assigned' : 'Unassigned'}</strong></span>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {isOwnerOrManager ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Archive className="w-3.5 h-3.5 text-brand-blue" />}
                        onClick={() => handleSingleArchive(lead)}
                      >
                        Archive
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5 text-status-critical" />}
                        onClick={() => handleOpenSingleTrashModal(lead)}
                      >
                        Trash
                      </Button>
                    </div>
                  ) : <div />}

                  <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate(`/leads/${lead.id}`)}>
                    Open Detail
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* PAGINATION CONTROLS */}
          {totalPages > 1 && (
            <div className="p-3 bg-surface-card border border-surface-border rounded-xl flex items-center justify-between gap-4 text-xs select-none">
              <span className="text-content-secondary">
                Page <strong className="text-navy-900">{page}</strong> of <strong className="text-navy-900">{totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  icon={<ChevronLeft className="w-4 h-4" />}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  icon={<ChevronRight className="w-4 h-4" />}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MOVE TO TRASH CONFIRMATION MODAL */}
      {isTrashModalOpen && trashTargets.length > 0 && (
        <div className="fixed inset-0 z-[120] bg-navy-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-surface-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border">
              <h3 className="font-heading font-bold text-base text-status-critical flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Move to Trash
              </h3>
              <button onClick={() => setIsTrashModalOpen(false)} className="text-slate-400 hover:text-navy-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTrash} className="space-y-4 text-xs">
              <p className="text-navy-900 font-semibold">
                Move {trashTargets.length === 1 ? (
                  <span className="font-bold text-navy-900">{trashTargets[0].full_name}</span>
                ) : (
                  <span className="font-bold text-navy-900">{trashTargets.length} selected leads</span>
                )} to Trash?
              </p>
              <p className="text-content-secondary">
                Leads moved to Trash can be restored by Managers and Owners at any time.
              </p>

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">
                  Reason for moving to Trash (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Duplicate inquiry, test record, or client cancelled..."
                  value={trashReason}
                  onChange={(e) => setTrashReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-surface-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsTrashModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger" size="sm" isLoading={trashing} icon={<Trash2 className="w-4 h-4" />}>
                  Move to Trash
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modals */}
      <AddLeadModal
        isOpen={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onSuccess={fetchLeads}
      />

      <LogContactModal
        isOpen={isLogContactOpen}
        onClose={() => setIsLogContactOpen(false)}
        lead={activeLead}
        onSuccess={fetchLeads}
      />

      <ScheduleFollowUpModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        lead={activeLead}
        onSuccess={fetchLeads}
      />
    </div>
  )
}
