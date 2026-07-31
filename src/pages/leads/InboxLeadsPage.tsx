import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadingState } from '../../components/ui/LoadingState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database.types'

import { AssignLeadModal } from '../../components/leads/AssignLeadModal'
import { LogContactModal } from '../../components/leads/LogContactModal'
import { ScheduleFollowUpModal } from '../../components/leads/ScheduleFollowUpModal'
import { AddLeadModal } from '../../components/leads/AddLeadModal'

import {
  Inbox,
  Phone,
  UserCheck,
  PhoneCall,
  Clock,
  ArrowRight,
  Plus,
  Tag,
  AlertCircle
} from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export const InboxLeadsPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [leads, setLeads] = useState<Lead[]>([])
  const [membersMap, setMembersMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action Modals State
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [isLogContactOpen, setIsLogContactOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)

  const fetchInboxLeads = useCallback(async () => {
    if (!currentWorkspace || !supabase) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch active leads with stage = 'new'
      const { data, error: err } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('stage', 'new')
        .order('created_at', { ascending: false })

      if (err) throw err
      setLeads((data || []) as Lead[])

      // 2. Fetch workspace members to map assigned names
      const { data: mems } = await supabase
        .from('workspace_members')
        .select('user_id, profile:profiles(full_name)')
        .eq('workspace_id', currentWorkspace.id)

      const rawMems = (mems as unknown) as Array<{ user_id: string; profile: { full_name: string } | null }> | null
      const map: Record<string, string> = {}
      if (rawMems) {
        rawMems.forEach((m) => {
          const prof = m.profile
          if (prof?.full_name) {
            map[m.user_id] = prof.full_name
          }
        })
      }
      setMembersMap(map)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch inbox leads'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    queueMicrotask(() => {
      fetchInboxLeads()
    })

    const handleCreated = () => fetchInboxLeads()
    window.addEventListener('noverlyn:lead_created', handleCreated)
    return () => window.removeEventListener('noverlyn:lead_created', handleCreated)
  }, [fetchInboxLeads])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl text-navy-900">Leads Inbox</h1>
            <Badge variant="blue" className="font-bold">{leads.length} New Inbound</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            New property inquiries requiring initial qualification, assignment, and contact.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddLeadOpen(true)}
        >
          Add Lead
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Card><LoadingState label="Loading inbound leads inbox..." /></Card>
      ) : leads.length === 0 ? (
        <Card>
          <EmptyState
            title="You're caught up — no new leads waiting"
            description="All inbound property inquiries have been qualified and progressed. New leads will automatically appear here."
            icon={<Inbox className="w-10 h-10 text-brand-blue" />}
            action={
              <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsAddLeadOpen(true)}>
                Add Lead
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {leads.map((lead) => {
              const isUnassigned = !lead.assigned_to
              const isNotContacted = !lead.last_contacted_at

              return (
                <div
                  key={lead.id}
                  className="bg-surface-card border border-surface-border rounded-xl p-5 hover:border-slate-400 transition-all shadow-2xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-navy-900 text-white font-bold text-base flex items-center justify-center shrink-0">
                        {lead.full_name[0]?.toUpperCase() || 'L'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3
                            onClick={() => navigate(`/leads/${lead.id}`)}
                            className="font-heading font-bold text-base text-navy-900 hover:text-brand-blue cursor-pointer transition-colors"
                          >
                            {lead.full_name}
                          </h3>
                          <Badge variant="blue" size="sm">NEW</Badge>
                          {isUnassigned && <Badge variant="warning" size="sm">UNASSIGNED</Badge>}
                          {isNotContacted && <Badge variant="critical" size="sm">NOT CONTACTED</Badge>}
                          <Badge
                            variant={lead.priority === 'hot' ? 'critical' : lead.priority === 'warm' ? 'warning' : 'neutral'}
                            size="sm"
                          >
                            {lead.priority.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-content-secondary mt-1">
                          <span className="flex items-center gap-1 font-medium text-navy-900">
                            <Phone className="w-3.5 h-3.5 text-content-muted" /> {lead.phone}
                          </span>
                          {lead.source && (
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-content-muted" /> {lead.source}
                            </span>
                          )}
                          <span className="text-content-muted">
                            Received {new Date(lead.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={<ArrowRight className="w-3.5 h-3.5" />}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      Open Lead
                    </Button>
                  </div>

                  {/* Body Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 bg-slate-50 border border-surface-border rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-content-muted block">Requirement</span>
                      <span className="font-medium text-navy-900 truncate block mt-0.5">
                        {lead.requirement || 'Not specified'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-surface-border rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-content-muted block">Budget / Value</span>
                      <span className="font-semibold text-navy-900 mt-0.5 block">
                        {lead.budget_min || lead.budget_max
                          ? `${currentWorkspace?.currency || 'USD'} ${lead.budget_min ? lead.budget_min.toLocaleString() : '0'} - ${lead.budget_max ? lead.budget_max.toLocaleString() : 'Max'}`
                          : lead.estimated_value
                          ? `${currentWorkspace?.currency || 'USD'} ${lead.estimated_value.toLocaleString()}`
                          : '—'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-surface-border rounded-lg">
                      <span className="text-[10px] uppercase font-bold text-content-muted block">Assigned Agent</span>
                      <span className="font-medium text-navy-900 mt-0.5 block">
                        {lead.assigned_to ? membersMap[lead.assigned_to] || 'Agent Assigned' : 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-border justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UserCheck className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setActiveLead(lead)
                        setIsAssignOpen(true)
                      }}
                    >
                      {lead.assigned_to ? 'Reassign' : 'Assign Agent'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={<PhoneCall className="w-3.5 h-3.5 text-emerald-600" />}
                      onClick={() => {
                        setActiveLead(lead)
                        setIsLogContactOpen(true)
                      }}
                    >
                      Log Contact
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Clock className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setActiveLead(lead)
                        setIsScheduleOpen(true)
                      }}
                    >
                      Schedule Follow-up
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Action Modals */}
      <AssignLeadModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        lead={activeLead}
        onSuccess={fetchInboxLeads}
      />

      <LogContactModal
        isOpen={isLogContactOpen}
        onClose={() => setIsLogContactOpen(false)}
        lead={activeLead}
        onSuccess={fetchInboxLeads}
      />

      <ScheduleFollowUpModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        lead={activeLead}
        onSuccess={fetchInboxLeads}
      />

      <AddLeadModal
        isOpen={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onSuccess={fetchInboxLeads}
      />
    </div>
  )
}
