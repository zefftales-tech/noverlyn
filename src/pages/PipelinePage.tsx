import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { LoadingState } from '../components/ui/LoadingState'
import { useWorkspace } from '../hooks/useWorkspace'
import { leadsApi } from '../lib/leadsApi'
import { fetchWorkspaceAttentionItems, type AttentionItem } from '../lib/attentionEngine'
import type { Database, LeadStage } from '../types/database.types'

import { KanbanColumn } from '../components/pipeline/KanbanColumn'
import { KanbanCard } from '../components/pipeline/KanbanCard'
import { MarkLostModal } from '../components/leads/MarkLostModal'
import { AddLeadModal } from '../components/leads/AddLeadModal'

import { Search, Plus, AlertTriangle, ShieldCheck } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export const PipelinePage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const navigate = useNavigate()

  const [stages, setStages] = useState<Array<{ id: string; title: string }>>([
    { id: 'new', title: 'New Lead' },
    { id: 'contacted', title: 'Contacted' },
    { id: 'qualified', title: 'Qualified' },
  ])
  const [leads, setLeads] = useState<Lead[]>([])
  const [attentionMap, setAttentionMap] = useState<Record<string, AttentionItem>>({})
  const [membersMap, setMembersMap] = useState<Record<string, string>>({})
  const [membersList, setMembersList] = useState<Array<{ userId: string; fullName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('all')
  const [selectedPriority, setSelectedPriority] = useState('all')
  const [mobileStage, setMobileStage] = useState<string>('new')

  // Drag and Drop active lead state
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null)

  // Modals state
  const [pendingLostLead, setPendingLostLead] = useState<Lead | null>(null)
  const [isMarkLostOpen, setIsMarkLostOpen] = useState(false)
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'
  const currency = currentWorkspace?.currency || 'USD'

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const loadPipelineData = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      // 0. Fetch workspace pipeline stages dynamically
      const wsBusinessType = (currentWorkspace as unknown as { business_type?: string })?.business_type
      const loadedStages = await leadsApi.getPipelineStages(currentWorkspace.id, wsBusinessType)
      setStages(loadedStages.map((s) => ({ id: s.stage_key, title: s.label })))

      // 1. Fetch leads directory
      const { data: leadsData } = await leadsApi.getLeads(currentWorkspace.id, { pageSize: 500 })
      setLeads(leadsData)

      // 2. Fetch canonical attention items map
      const attentionData = await fetchWorkspaceAttentionItems(currentWorkspace.id)
      const attMap: Record<string, AttentionItem> = {}
      attentionData.forEach((item) => {
        attMap[item.lead_id] = item
      })
      setAttentionMap(attMap)

      // 3. Fetch workspace members
      const members = await leadsApi.getWorkspaceMembers(currentWorkspace.id)
      const mMap: Record<string, string> = {}
      members.forEach((m) => {
        mMap[m.userId] = m.fullName
      })
      setMembersMap(mMap)
      setMembersList(members)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load pipeline data'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadPipelineData()
    })

    const handleUpdate = () => loadPipelineData()
    window.addEventListener('noverlyn:lead_created', handleUpdate)
    return () => window.removeEventListener('noverlyn:lead_created', handleUpdate)
  }, [loadPipelineData])

  // Filtered Leads
  const filteredLeads = leads.filter((lead) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchesName = lead.full_name.toLowerCase().includes(q)
      const matchesPhone = lead.phone.includes(q)
      if (!matchesName && !matchesPhone) return false
    }
    if (selectedAgent !== 'all' && lead.assigned_to !== selectedAgent) return false
    if (selectedPriority !== 'all' && lead.priority !== selectedPriority) return false
    return true
  })

  // Drag and Drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const dragged = leads.find((l) => l.id === active.id) || null
    setActiveDragLead(dragged)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragLead(null)

    if (!over) return

    const draggedLeadId = String(active.id)
    const targetStage = String(over.id) as LeadStage

    const leadToUpdate = leads.find((l) => l.id === draggedLeadId)
    if (!leadToUpdate || leadToUpdate.stage === targetStage) return

    // DRAG TO LOST INTERCEPTOR!
    if (targetStage === 'lost') {
      setPendingLostLead(leadToUpdate)
      setIsMarkLostOpen(true)
      return
    }

    // Optimistic UI update
    const previousLeads = [...leads]
    setLeads((prev) =>
      prev.map((l) => (l.id === draggedLeadId ? { ...l, stage: targetStage, status: targetStage === 'won' ? 'won' : 'active' } : l))
    )

    try {
      await leadsApi.changeStage(draggedLeadId, targetStage)
      loadPipelineData()
    } catch (err: unknown) {
      // Rollback on failure
      setLeads(previousLeads)
      alert(err instanceof Error ? err.message : 'Failed to update pipeline stage')
    }
  }

  const agentOptions = [
    { value: 'all', label: 'All Agents' },
    ...membersList.map((m) => ({ value: m.userId, label: m.fullName })),
  ]

  const priorityOptions = [
    { value: 'all', label: 'All Priorities' },
    { value: 'hot', label: 'Hot Priority' },
    { value: 'warm', label: 'Warm Priority' },
    { value: 'cold', label: 'Cold Priority' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl text-navy-900">Visual Lead Pipeline</h1>
            <Badge variant="blue" className="font-bold">{filteredLeads.length} Leads</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Drag-and-drop Kanban pipeline for deal stage progression in <span className="font-semibold text-navy-900">{currentWorkspace?.name}</span>
          </p>
        </div>

        <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsAddLeadOpen(true)}>
          Add Lead
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          placeholder="Search by lead name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />

        {isOwnerOrManager ? (
          <Select options={agentOptions} value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} />
        ) : (
          <div className="flex items-center gap-2 text-xs text-content-secondary bg-slate-50 px-3 py-2 rounded-lg border border-surface-border">
            <ShieldCheck className="w-4 h-4 text-brand-blue" />
            <span>Agent Scope: <strong className="text-navy-900 font-semibold">Workspace Pipeline</strong></span>
          </div>
        )}

        <Select options={priorityOptions} value={selectedPriority} onChange={(e) => setSelectedPriority(e.target.value)} />
      </div>

      {/* PIPELINE KANBAN BOARD */}
      {loading ? (
        <Card><LoadingState label="Loading visual pipeline board..." /></Card>
      ) : (
        <>
          {/* Desktop & Tablet Drag and Drop Kanban */}
          <div className="hidden md:block overflow-x-auto pb-6">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 min-w-max">
                {stages.map((stg) => {
                  const columnLeads = filteredLeads.filter((l) => l.stage === stg.id)
                  return (
                    <KanbanColumn
                      key={stg.id}
                      id={stg.id as LeadStage}
                      title={stg.title}
                      leads={columnLeads}
                      attentionMap={attentionMap}
                      membersMap={membersMap}
                      currency={currency}
                      onLeadClick={(l) => navigate(`/leads/${l.id}`)}
                    />
                  )
                })}
              </div>

              <DragOverlay>
                {activeDragLead ? (
                  <KanbanCard
                    lead={activeDragLead}
                    attentionItem={attentionMap[activeDragLead.id]}
                    agentName={activeDragLead.assigned_to ? membersMap[activeDragLead.assigned_to] : undefined}
                    currency={currency}
                    onCardClick={() => {}}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Mobile View: Stage Selector Tabs + Card List */}
          <div className="md:hidden space-y-4">
            <Select
              options={stages.map((s) => ({ value: s.id, label: `${s.title} (${filteredLeads.filter((l) => l.stage === s.id).length})` }))}
              value={mobileStage}
              onChange={(e) => setMobileStage(e.target.value)}
            />

            <div className="space-y-3">
              {filteredLeads.filter((l) => l.stage === mobileStage).length === 0 ? (
                <div className="p-6 text-center text-xs text-content-muted bg-slate-50 border border-dashed rounded-lg">
                  No leads in this stage
                </div>
              ) : (
                filteredLeads
                  .filter((l) => l.stage === mobileStage)
                  .map((lead) => (
                    <KanbanCard
                      key={lead.id}
                      lead={lead}
                      attentionItem={attentionMap[lead.id]}
                      agentName={lead.assigned_to ? membersMap[lead.assigned_to] : undefined}
                      currency={currency}
                      onCardClick={() => navigate(`/leads/${lead.id}`)}
                    />
                  ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <MarkLostModal
        isOpen={isMarkLostOpen}
        onClose={() => {
          setIsMarkLostOpen(false)
          setPendingLostLead(null)
        }}
        lead={pendingLostLead}
        onSuccess={loadPipelineData}
      />

      <AddLeadModal
        isOpen={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onSuccess={loadPipelineData}
      />
    </div>
  )
}
