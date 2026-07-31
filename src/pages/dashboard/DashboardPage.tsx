import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/LoadingState'
import { useWorkspace } from '../../hooks/useWorkspace'
import { supabase } from '../../lib/supabase'
import {
  fetchWorkspaceAttentionItems,
  type AttentionItem,
  getUrgencyBadgeVariant
} from '../../lib/attentionEngine'
import type { Database } from '../../types/database.types'

import {
  AlertTriangle,
  Clock,
  Flame,
  UserX,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  PhoneCall
} from 'lucide-react'
import { FirstRunChecklist } from '../../components/dashboard/FirstRunChecklist'

type Lead = Database['public']['Tables']['leads']['Row']

export const DashboardPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)

  // Canonical Attention Items
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])

  // Factual Stage & Team & Lost counts
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({
    new: 0,
    contacted: 0,
    qualified: 0,
    property_shared: 0,
    viewing_scheduled: 0,
    negotiation: 0,
    won: 0,
    lost: 0,
  })
  const [teamStats, setTeamStats] = useState<Array<{ name: string; activeCount: number }>>([])
  const [lostCount, setLostCount] = useState<number>(0)
  const [lostReasons, setLostReasons] = useState<Record<string, number>>({})
  const [highValueThreshold, setHighValueThreshold] = useState<number | null>(null)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const fetchDashboardData = useCallback(async () => {
    if (!currentWorkspace || !supabase) return
    setLoading(true)

    try {
      // 1. Fetch Canonical Attention Items from SQL Engine
      const items = await fetchWorkspaceAttentionItems(currentWorkspace.id)
      setAttentionItems(items)

      // 2. Fetch Workspace Settings
      const { data: settingsData } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .single()

      const ws = settingsData as Database['public']['Tables']['workspace_settings']['Row'] | null
      setHighValueThreshold(ws?.high_value_threshold ?? null)

      // 3. Fetch Leads for Stage & Lost Stats
      const { data: allLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)

      const leadsList = (allLeads || []) as Lead[]

      const sCounts: Record<string, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        property_shared: 0,
        viewing_scheduled: 0,
        negotiation: 0,
        won: 0,
        lost: 0,
      }
      let lostTotal = 0
      const lostReasonsMap: Record<string, number> = {}

      leadsList.forEach((l) => {
        if (sCounts[l.stage] !== undefined) {
          sCounts[l.stage] += 1
        }
        if (l.stage === 'lost' || l.status === 'lost') {
          lostTotal += 1
          if (l.lost_reason) {
            lostReasonsMap[l.lost_reason] = (lostReasonsMap[l.lost_reason] || 0) + 1
          }
        }
      })

      setStageCounts(sCounts)
      setLostCount(lostTotal)
      setLostReasons(lostReasonsMap)

      // 4. Fetch Members & Active Leads count per agent
      const { data: mems } = await supabase
        .from('workspace_members')
        .select('user_id, profile:profiles(full_name)')
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'active')

      const rawMems = (mems as unknown) as Array<{ user_id: string; profile: { full_name: string } | null }> | null

      if (rawMems) {
        const tStats = rawMems.map((m) => {
          const prof = m.profile
          const activeCount = leadsList.filter((l) => l.assigned_to === m.user_id && l.status === 'active').length
          return {
            name: prof?.full_name || 'Agent',
            activeCount,
          }
        })
        setTeamStats(tStats)
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchDashboardData()
    })

    const handleUpdate = () => fetchDashboardData()
    window.addEventListener('noverlyn:lead_created', handleUpdate)
    return () => window.removeEventListener('noverlyn:lead_created', handleUpdate)
  }, [fetchDashboardData])

  if (loading) {
    return <Card><LoadingState label="Loading real-time command metrics..." /></Card>
  }

  // Calculate distinct lead counts directly from Canonical Attention Items
  const overdueCount = attentionItems.filter((i) => i.primary_issue === 'overdue_follow_up').length
  const dueTodayCount = attentionItems.filter((i) => i.primary_issue === 'due_today').length
  const hotRiskCount = attentionItems.filter((i) => i.primary_issue === 'hot_lead_inactive').length
  const unassignedCount = attentionItems.filter((i) => i.primary_issue === 'unassigned_lead').length
  const highValueRiskCount = attentionItems.filter((i) => i.primary_issue === 'high_value_at_risk').length
  const negotiationNoActionCount = attentionItems.filter((i) => i.primary_issue === 'negotiation_no_action').length

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl text-navy-900">
              {isOwnerOrManager ? 'Lead Operations Command' : 'Your Attention Today'}
            </h1>
            <Badge variant="success" className="uppercase tracking-wider text-[10px] font-bold">Phase 3 Operational Engine</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Real-time deterministic attention metrics for <span className="font-semibold text-navy-900">{currentWorkspace?.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-content-secondary bg-surface-card px-3 py-1.5 rounded-lg border border-surface-border">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Tenant Scope: <strong className="text-navy-900 font-semibold">{currentWorkspace?.slug}</strong></span>
          <span className="text-slate-300">•</span>
          <span>Role: <strong className="text-navy-900 font-semibold uppercase">{currentRole}</strong></span>
        </div>
      </div>

      {/* FIRST-RUN ONBOARDING CHECKLIST */}
      <FirstRunChecklist />

      {/* SECTION 1: NEEDS ATTENTION (Clickable Cards -> Navigates to Work Queue with Filter) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning" />
            <h2 className="font-heading font-bold text-base text-navy-900">Needs Attention Today</h2>
          </div>
          <span className="text-[11px] text-content-muted">Canonical Deterministic Risk Overview</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Overdue Follow-ups */}
          <div
            onClick={() => navigate('/work-queue?filter=overdue')}
            className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-2 hover:border-brand-blue cursor-pointer transition-colors group shadow-2xs"
          >
            <div className="flex items-center justify-between text-content-muted">
              <span className="text-xs font-semibold group-hover:text-brand-blue transition-colors">Overdue Follow-ups</span>
              <Clock className="w-4 h-4 text-status-critical" />
            </div>
            <div className="text-2xl font-bold font-heading text-navy-900">{overdueCount}</div>
            <p className="text-[11px] text-content-muted">Leads with past scheduled actions</p>
          </div>

          {/* Card 2: Due Today */}
          <div
            onClick={() => navigate('/work-queue?filter=due_today')}
            className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-2 hover:border-brand-blue cursor-pointer transition-colors group shadow-2xs"
          >
            <div className="flex items-center justify-between text-content-muted">
              <span className="text-xs font-semibold group-hover:text-brand-blue transition-colors">Due Today</span>
              <CheckCircle2 className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="text-2xl font-bold font-heading text-navy-900">{dueTodayCount}</div>
            <p className="text-[11px] text-content-muted">Due later today (excl. overdue)</p>
          </div>

          {/* Card 3: Hot Leads At Risk */}
          <div
            onClick={() => navigate('/work-queue?filter=at_risk')}
            className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-2 hover:border-brand-blue cursor-pointer transition-colors group shadow-2xs"
          >
            <div className="flex items-center justify-between text-content-muted">
              <span className="text-xs font-semibold group-hover:text-brand-blue transition-colors">Hot Leads At Risk</span>
              <Flame className="w-4 h-4 text-status-warning" />
            </div>
            <div className="text-2xl font-bold font-heading text-navy-900">{hotRiskCount}</div>
            <p className="text-[11px] text-content-muted">Hot priority leads inactive past SLA</p>
          </div>

          {/* Card 4: Unassigned Leads */}
          <div
            onClick={() => navigate('/work-queue?filter=unassigned')}
            className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-2 hover:border-brand-blue cursor-pointer transition-colors group shadow-2xs"
          >
            <div className="flex items-center justify-between text-content-muted">
              <span className="text-xs font-semibold group-hover:text-brand-blue transition-colors">Unassigned Leads</span>
              <UserX className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold font-heading text-navy-900">{unassignedCount}</div>
            <p className="text-[11px] text-content-muted">Active leads awaiting agent</p>
          </div>

          {/* Card 5: High-Value At Risk */}
          <div
            onClick={() => navigate('/work-queue?filter=at_risk')}
            className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-2 hover:border-brand-blue cursor-pointer transition-colors group shadow-2xs"
          >
            <div className="flex items-center justify-between text-content-muted">
              <span className="text-xs font-semibold group-hover:text-brand-blue transition-colors">High-Value At Risk</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-heading text-navy-900">{highValueRiskCount}</div>
            <p className="text-[11px] text-content-muted">
              {highValueThreshold
                ? `>= ${currentWorkspace?.currency || 'USD'} ${highValueThreshold.toLocaleString()}`
                : 'Threshold set in Settings'}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: OWNER / MANAGER ATTENTION SUMMARY */}
      {isOwnerOrManager && (
        <Card title="Manager Attention Summary" subtitle="Factual rule-based operational risks requiring managerial oversight">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-1">
              <span className="text-content-secondary font-medium">Unassigned Active Leads</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold font-heading text-navy-900">{unassignedCount}</span>
                <Badge variant={unassignedCount > 0 ? 'warning' : 'neutral'} size="sm">
                  {unassignedCount > 0 ? 'NEEDS AGENT' : 'OK'}
                </Badge>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-1">
              <span className="text-content-secondary font-medium">Overdue Action Items</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold font-heading text-navy-900">{overdueCount}</span>
                <Badge variant={overdueCount > 0 ? 'critical' : 'neutral'} size="sm">
                  {overdueCount > 0 ? 'ACTION NEEDED' : 'OK'}
                </Badge>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-1">
              <span className="text-content-secondary font-medium">Negotiation Missing Next Action</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold font-heading text-navy-900">{negotiationNoActionCount}</span>
                <Badge variant={negotiationNoActionCount > 0 ? 'warning' : 'neutral'} size="sm">
                  {negotiationNoActionCount > 0 ? 'STALLED' : 'OK'}
                </Badge>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-surface-border rounded-lg space-y-1">
              <span className="text-content-secondary font-medium">High-Value Deals At Risk</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold font-heading text-navy-900">{highValueRiskCount}</span>
                <Badge variant={highValueRiskCount > 0 ? 'critical' : 'neutral'} size="sm">
                  {highValueRiskCount > 0 ? 'HIGH RISK' : 'OK'}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 3: TODAY'S WORK QUEUE PREVIEW */}
      <Card
        title="Today's Priority Attention Items"
        subtitle="Top 6 deterministic attention items requiring immediate resolution"
        action={
          <Button variant="primary" size="sm" icon={<ArrowUpRight className="w-3.5 h-3.5" />} onClick={() => navigate('/work-queue')}>
            Open Daily Work Queue
          </Button>
        }
      >
        {attentionItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-content-muted bg-slate-50 border border-dashed border-surface-border rounded-lg">
            No active attention items requiring action right now.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Urgency</th>
                  <th className="p-3">Lead Name</th>
                  <th className="p-3">Primary Reason</th>
                  <th className="p-3">Est. Value</th>
                  <th className="p-3">Recommended Next Action</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {attentionItems.slice(0, 6).map((item) => (
                  <tr key={item.lead_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3">
                      <Badge variant={getUrgencyBadgeVariant(item.urgency_level)} size="sm">
                        {item.urgency_level}
                      </Badge>
                    </td>

                    <td className="p-3 font-bold text-navy-900">
                      <span onClick={() => navigate(`/leads/${item.lead_id}`)} className="hover:text-brand-blue cursor-pointer">
                        {item.lead_name}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-navy-900">{item.primary_issue_label}</span>
                      <p className="text-[11px] text-content-muted mt-0.5">{item.primary_issue_detail}</p>
                    </td>

                    <td className="p-3 font-medium text-navy-900">
                      {item.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${item.estimated_value.toLocaleString()}` : '—'}
                    </td>

                    <td className="p-3 font-medium text-content-secondary">{item.next_action}</td>

                    <td className="p-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<PhoneCall className="w-3 h-3 text-brand-blue" />}
                        onClick={() => navigate(`/leads/${item.lead_id}`)}
                      >
                        Open Lead
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* SECTION 4 & 5: PIPELINE HEALTH & TEAM ACCOUNTABILITY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PIPELINE HEALTH */}
        <Card title="Pipeline Health" subtitle="Real-time count of active leads across deal stages">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { stage: 'New', count: stageCounts.new },
              { stage: 'Contacted', count: stageCounts.contacted },
              { stage: 'Qualified', count: stageCounts.qualified },
              { stage: 'Prop Shared', count: stageCounts.property_shared },
              { stage: 'Viewing', count: stageCounts.viewing_scheduled },
              { stage: 'Negotiation', count: stageCounts.negotiation },
              { stage: 'Won', count: stageCounts.won },
              { stage: 'Lost', count: stageCounts.lost },
            ].map((item, i) => (
              <div key={i} className="p-3 bg-slate-50 border border-surface-border rounded-lg text-center space-y-1">
                <span className="text-[11px] font-semibold text-content-secondary uppercase block truncate">{item.stage}</span>
                <span className="text-xl font-bold font-heading text-navy-900 block">{item.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* TEAM ACCOUNTABILITY */}
        <Card title="Team Assignment Overview" subtitle="Factual count of active leads assigned per agent">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-border text-content-secondary font-semibold uppercase text-[10px]">
                  <th className="pb-2">Agent Name</th>
                  <th className="pb-2 text-right">Active Assigned Leads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {teamStats.map((ts, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 font-medium text-navy-900">{ts.name}</td>
                    <td className="py-2.5 text-right font-bold text-navy-900">{ts.activeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* SECTION 6: LOST LEAD INTELLIGENCE */}
      <Card title="Lost Lead Intelligence" subtitle="Root-cause analysis of why property deals die">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 border border-surface-border rounded-lg gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white border border-surface-border rounded-lg text-status-critical">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-heading font-semibold text-sm text-navy-900">Total Lost Deals Recorded</h4>
                <p className="text-xs text-content-secondary">Captured via mandatory mark lost reason modal.</p>
              </div>
            </div>
            <Badge variant="critical" className="font-bold text-sm px-3 py-1">{lostCount} Lost Deals</Badge>
          </div>

          {Object.keys(lostReasons).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {Object.entries(lostReasons).map(([reason, count]) => (
                <div key={reason} className="p-3 bg-red-50/50 border border-red-200 rounded-lg text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-red-700 block truncate">{reason.replace('_', ' ')}</span>
                  <span className="text-lg font-bold text-navy-900 block">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
