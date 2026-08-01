import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/LoadingState'
import { Avatar } from '../../components/ui/Avatar'
import { useWorkspace } from '../../hooks/useWorkspace'
import { supabase } from '../../lib/supabase'
import {
  fetchWorkspaceAttentionItems,
  type AttentionItem,
  getUrgencyBadgeVariant
} from '../../lib/attentionEngine'
import { getTemplateForBusinessType } from '../../lib/templates'
import type { Database } from '../../types/database.types'

import {
  Clock,
  Flame,
  UserX,
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  PhoneCall,
  Activity,
  AlertCircle,
  Users,
  Check,
  GitPullRequest
} from 'lucide-react'
import { FirstRunChecklist } from '../../components/dashboard/FirstRunChecklist'

type Lead = Database['public']['Tables']['leads']['Row']

export const DashboardPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [teamStats, setTeamStats] = useState<Array<{ name: string; activeCount: number }>>([])
  const [lostCount, setLostCount] = useState<number>(0)
  const [lostReasons, setLostReasons] = useState<Record<string, number>>({})
  const [highValueThreshold, setHighValueThreshold] = useState<number | null>(null)

  const activeTemplate = getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type)

  const fetchDashboardData = useCallback(async () => {
    if (!currentWorkspace || !supabase) return
    setLoading(true)

    try {
      // 1. Fetch Attention Items
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

      const sCounts: Record<string, number> = {}
      activeTemplate.stages.forEach((stg) => {
        sCounts[stg.key] = 0
      })

      let lostTotal = 0
      const lostReasonsMap: Record<string, number> = {}

      leadsList.forEach((l) => {
        if (sCounts[l.stage] !== undefined) {
          sCounts[l.stage] += 1
        } else {
          sCounts[l.stage] = (sCounts[l.stage] || 0) + 1
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
        .select('user_id')
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'active')

      const rawMems = (mems || []) as Array<{ user_id: string }>

      if (rawMems.length > 0) {
        const userIds = rawMems.map((m) => m.user_id)
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)

        const profMap: Record<string, string> = {}
        if (profs) {
          (profs as Array<{ id: string; full_name: string }>).forEach((p) => {
            profMap[p.id] = p.full_name
          })
        }

        const tStats = rawMems.map((m) => {
          const activeCount = leadsList.filter((l) => l.assigned_to === m.user_id && l.status === 'active').length
          return {
            name: profMap[m.user_id] || 'Agent',
            activeCount,
          }
        })
        setTeamStats(tStats)
      } else {
        setTeamStats([])
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, activeTemplate])

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchDashboardData()
    })

    const handleUpdate = () => fetchDashboardData()
    window.addEventListener('noverlyn:lead_created', handleUpdate)
    return () => window.removeEventListener('noverlyn:lead_created', handleUpdate)
  }, [fetchDashboardData])

  if (loading) {
    return <Card><LoadingState label="Loading overview metrics..." /></Card>
  }

  // Calculate metrics
  const overdueCount = attentionItems.filter((i) => i.primary_issue === 'overdue_follow_up').length
  const dueTodayCount = attentionItems.filter((i) => i.primary_issue === 'due_today').length
  const hotRiskCount = attentionItems.filter((i) => i.primary_issue === 'hot_lead_inactive').length
  const unassignedCount = attentionItems.filter((i) => i.primary_issue === 'unassigned_lead').length
  const highValueRiskCount = attentionItems.filter((i) => i.primary_issue === 'high_value_at_risk').length

  const totalActiveLeads = Object.values(stageCounts).reduce((acc, c) => acc + c, 0) || 1
  const maxTeamLeads = Math.max(...teamStats.map((t) => t.activeCount), 1)

  return (
    <div className="space-y-7 max-w-[1600px] mx-auto px-1 sm:px-2">
      {/* A. PAGE HEADER */}
      <div className="pb-3 border-b border-surface-border/60">
        <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight">
          Operations Overview
        </h1>
        <p className="text-sm text-content-secondary mt-1">
          See what needs attention, how your pipeline is moving, and where your team should focus today.
        </p>
      </div>

      {/* FIRST-RUN ONBOARDING CHECKLIST */}
      <FirstRunChecklist />

      {/* B. KPI ROW (5 PREMIUM CARDS) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-blue" />
            <h2 className="font-heading font-bold text-lg text-navy-900">Needs Attention Today</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Overdue Follow-ups */}
          <div
            onClick={() => navigate('/work-queue?filter=overdue')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-red-300 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">Overdue Follow-ups</span>
              <div className="w-9 h-9 rounded-xl bg-red-50 text-status-critical flex items-center justify-center shrink-0">
                <Clock className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{overdueCount}</div>
            <p className="text-xs text-content-secondary">
              {overdueCount > 0 ? `${overdueCount} overdue actions` : 'No overdue actions'}
            </p>
          </div>

          {/* Card 2: Due Today */}
          <div
            onClick={() => navigate('/work-queue?filter=due_today')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-brand-blue/40 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">Due Today</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{dueTodayCount}</div>
            <p className="text-xs text-content-secondary">
              {dueTodayCount > 0 ? `${dueTodayCount} scheduled today` : 'No tasks due today'}
            </p>
          </div>

          {/* Card 3: Hot Leads At Risk */}
          <div
            onClick={() => navigate('/work-queue?filter=at_risk')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-amber-300 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">Hot Leads At Risk</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-status-warning flex items-center justify-center shrink-0">
                <Flame className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{hotRiskCount}</div>
            <p className="text-xs text-content-secondary">
              {hotRiskCount > 0 ? `${hotRiskCount} hot leads inactive` : 'All hot leads active'}
            </p>
          </div>

          {/* Card 4: Unassigned Leads */}
          <div
            onClick={() => navigate('/work-queue?filter=unassigned')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-indigo-300 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">Unassigned Leads</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <UserX className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{unassignedCount}</div>
            <p className="text-xs text-content-secondary">
              {unassignedCount > 0 ? `${unassignedCount} awaiting agent` : 'All leads assigned'}
            </p>
          </div>

          {/* Card 5: High-Value At Risk */}
          <div
            onClick={() => navigate('/work-queue?filter=at_risk')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-emerald-300 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">High-Value At Risk</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{highValueRiskCount}</div>
            <p className="text-xs text-content-secondary">
              {highValueThreshold
                ? `>= ${currentWorkspace?.currency || 'USD'} ${highValueThreshold.toLocaleString()}`
                : 'High-value deals needing action'}
            </p>
          </div>
        </div>
      </section>

      {/* C. PRIORITY ACTIONS */}
      <Card
        title="Priority Actions"
        subtitle="The leads and follow-ups that need attention first."
        action={
          <Button variant="primary" size="sm" icon={<ArrowUpRight className="w-3.5 h-3.5" />} onClick={() => navigate('/work-queue')}>
            Open Work Queue
          </Button>
        }
      >
        {attentionItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-content-secondary bg-slate-50/50 border border-dashed border-surface-border rounded-xl">
            You're all caught up! No priority items currently require attention.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-border/60 bg-slate-50/60 text-content-secondary font-semibold text-xs">
                  <th className="py-3.5 px-6">Priority</th>
                  <th className="py-3.5 px-6">Lead</th>
                  <th className="py-3.5 px-6">Reason</th>
                  <th className="py-3.5 px-6">Value</th>
                  <th className="py-3.5 px-6">Next Action</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {attentionItems.slice(0, 6).map((item) => (
                  <tr key={item.lead_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6">
                      <Badge variant={getUrgencyBadgeVariant(item.urgency_level)} size="sm">
                        {item.urgency_level}
                      </Badge>
                    </td>

                    <td className="py-4 px-6 font-bold text-navy-900">
                      <span onClick={() => navigate(`/leads/${item.lead_id}`)} className="hover:text-brand-blue cursor-pointer transition-colors">
                        {item.lead_name}
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      <span className="font-semibold text-navy-900">{item.primary_issue_label}</span>
                      <p className="text-xs text-content-secondary mt-0.5">{item.primary_issue_detail}</p>
                    </td>

                    <td className="py-4 px-6 font-semibold text-navy-900">
                      {item.estimated_value ? `${currentWorkspace?.currency || 'USD'} ${item.estimated_value.toLocaleString()}` : '—'}
                    </td>

                    <td className="py-4 px-6 font-medium text-content-secondary">{item.next_action}</td>

                    <td className="py-4 px-6 text-right">
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

      {/* D. PIPELINE OVERVIEW (2-COLUMN COMPACT GRID) + TEAM WORKLOAD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* PIPELINE OVERVIEW */}
        <Card
          title="Pipeline Overview"
          subtitle="Dynamic stage distribution across active opportunities"
          action={
            <Button variant="ghost" size="sm" icon={<GitPullRequest className="w-3.5 h-3.5" />} onClick={() => navigate('/pipeline')}>
              Kanban Board
            </Button>
          }
        >
          <div className="space-y-4">
            {/* Segmented Pipeline Bar */}
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-surface-border/60">
              {activeTemplate.stages.map((stg) => {
                const count = stageCounts[stg.key] || 0
                const pct = Math.round((count / totalActiveLeads) * 100)
                if (pct === 0) return null

                let barColor = 'bg-brand-blue'
                if (stg.key === 'won') barColor = 'bg-emerald-500'
                if (stg.key === 'lost') barColor = 'bg-red-400'

                return (
                  <div
                    key={stg.key}
                    style={{ width: `${pct}%` }}
                    className={`${barColor} h-full first:rounded-l-full last:rounded-r-full transition-all duration-300`}
                    title={`${stg.label}: ${count} (${pct}%)`}
                  />
                )
              })}
            </div>

            {/* 2-Column Compact Stage Grid on Desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {activeTemplate.stages.map((stg) => {
                const count = stageCounts[stg.key] || 0
                const pct = Math.round((count / totalActiveLeads) * 100)

                return (
                  <div key={stg.key} className="p-2.5 bg-slate-50/60 border border-surface-border/40 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition-colors">
                    <span className="text-xs font-semibold text-navy-900 truncate pr-2">{stg.label}</span>
                    <span className="text-xs font-bold text-navy-900 bg-white px-2 py-0.5 rounded-lg border border-surface-border/60 shrink-0">
                      {count} <span className="text-content-secondary font-normal text-[11px]">· {pct}%</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        {/* TEAM WORKLOAD */}
        <Card
          title="Team Workload"
          subtitle="Active leads assigned per active team member"
          action={
            <Button variant="ghost" size="sm" icon={<ArrowUpRight className="w-3.5 h-3.5" />} onClick={() => navigate('/team')}>
              View Team
            </Button>
          }
        >
          {teamStats.length === 0 ? (
            <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center text-xs p-4 bg-slate-50/40 border border-surface-border/40 rounded-xl space-y-2">
              <Users className="w-6 h-6 text-content-muted" />
              <p className="font-bold text-navy-900 text-sm">No team workload yet</p>
              <p className="text-content-secondary max-w-xs">Assign leads to team members to start tracking workload.</p>
              <div className="pt-1">
                <Button variant="outline" size="sm" onClick={() => navigate('/team')}>
                  View Team
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {teamStats.map((ts, idx) => {
                const pct = Math.round((ts.activeCount / maxTeamLeads) * 100)
                return (
                  <div key={idx} className="p-3 bg-slate-50/60 border border-surface-border/40 rounded-xl space-y-2 hover:bg-slate-100/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={ts.name} size="sm" />
                        <span className="font-semibold text-xs text-navy-900">{ts.name}</span>
                      </div>
                      <span className="text-xs font-bold text-navy-900">{ts.activeCount} Active Leads</span>
                    </div>
                    <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-brand-blue h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* E. LOST OPPORTUNITIES */}
      {lostCount === 0 ? (
        <div className="bg-surface-card border border-surface-border/80 rounded-2xl p-5 shadow-saas flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-bold text-sm text-navy-900">No lost opportunities recorded</h4>
            <p className="text-xs text-content-secondary mt-0.5">
              Lost deal intelligence and root-cause metrics will appear here once a deal is marked lost.
            </p>
          </div>
        </div>
      ) : (
        <Card title="Lost Opportunities" subtitle="Root-cause metrics for lost deals">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50/80 border border-surface-border/60 rounded-xl gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white border border-surface-border rounded-xl text-status-critical shadow-2xs">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-sm text-navy-900">Total Lost Deals</h4>
                  <p className="text-xs text-content-secondary">Recorded from mandatory loss reasons.</p>
                </div>
              </div>
              <Badge variant="critical" className="font-bold text-sm px-3 py-1">{lostCount} Lost Deals</Badge>
            </div>

            {Object.keys(lostReasons).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {Object.entries(lostReasons).map(([reason, count]) => (
                  <div key={reason} className="p-3.5 bg-red-50/40 border border-red-200/80 rounded-xl text-center space-y-1">
                    <span className="text-xs font-semibold text-red-700 block truncate">{reason.replace('_', ' ')}</span>
                    <span className="text-xl font-bold text-navy-900 block">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
