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
  ArrowUpRight,
  CheckCircle2,
  PhoneCall,
  Activity,
  Users,
  GitPullRequest,
  Inbox,
  DollarSign,
  Trophy,
  RefreshCw,
  MessageSquare
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
  const [pendingFormCount, setPendingFormCount] = useState<number>(0)
  const [needsWaResponseCount, setNeedsWaResponseCount] = useState<number>(0)
  const [pipelineTotalValue, setPipelineTotalValue] = useState<number>(0)
  const [wonCount, setWonCount] = useState<number>(0)
  const [wonTotalValue, setWonTotalValue] = useState<number>(0)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())

  const activeTemplate = getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type)

  const fetchDashboardData = useCallback(async () => {
    if (!currentWorkspace || !supabase) return
    setLoading(true)

    try {
      // 1. Fetch Attention Items
      const items = await fetchWorkspaceAttentionItems(currentWorkspace.id)
      setAttentionItems(items)

      // 2. Fetch Pending Form Submissions Count
      const { count: pCount } = await supabase
        .from('public_form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'pending')

      setPendingFormCount(pCount || 0)

      // 3. Fetch Needs WhatsApp Response Count
      const { count: waCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', currentWorkspace.id)
        .eq('communication_status', 'needs_response')
        .is('deleted_at', null)
        .is('archived_at', null)

      setNeedsWaResponseCount(waCount || 0)

      // 4. Fetch Leads for Stage & Value Metrics
      const { data: allLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .is('deleted_at', null)
        .is('archived_at', null)

      const leadsList = (allLeads || []) as Lead[]

      const sCounts: Record<string, number> = {}
      activeTemplate.stages.forEach((stg) => {
        sCounts[stg.key] = 0
      })

      let totalVal = 0
      let wonCnt = 0
      let wonVal = 0

      leadsList.forEach((l) => {
        if (sCounts[l.stage] !== undefined) {
          sCounts[l.stage] += 1
        } else {
          sCounts[l.stage] = (sCounts[l.stage] || 0) + 1
        }

        if (l.estimated_value) {
          totalVal += l.estimated_value
        }

        if (l.stage === 'won' || l.status === 'won') {
          wonCnt += 1
          if (l.estimated_value) wonVal += l.estimated_value
        }
      })

      setStageCounts(sCounts)
      setPipelineTotalValue(totalVal)
      setWonCount(wonCnt)
      setWonTotalValue(wonVal)

      // 5. Fetch Members & Active Leads count per agent
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

      setLastRefreshedAt(new Date())
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

  const totalActiveLeads = Object.values(stageCounts).reduce((acc, c) => acc + c, 0) || 1
  const maxTeamLeads = Math.max(...teamStats.map((t) => t.activeCount), 1)

  return (
    <div className="space-y-7 max-w-[1600px] mx-auto px-1 sm:px-2">
      {/* A. PAGE HEADER WITH CONTEXT & ACTIONS */}
      <div className="pb-3 border-b border-surface-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight">
            Operations Overview
          </h1>
          <p className="text-sm text-content-secondary mt-1 flex items-center gap-2 flex-wrap">
            <span>See what needs attention, pipeline progress, and agent workload today.</span>
            <span className="text-[11px] text-content-muted flex items-center gap-1 font-mono">
              <RefreshCw className="w-3 h-3" /> Updated {lastRefreshedAt.toLocaleTimeString([], { timeStyle: 'short' })}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            onClick={() => navigate('/work-queue')}
          >
            Work Queue
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/leads')}
          >
            All Leads
          </Button>
        </div>
      </div>

      {/* FIRST-RUN ONBOARDING CHECKLIST */}
      <FirstRunChecklist />

      {/* B. OPERATIONAL ACTIONABLE KPIS (5 CARDS) */}
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

          {/* Card 3: Needs WhatsApp Response */}
          <div
            onClick={() => navigate('/work-queue?filter=needs_response')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-emerald-300 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">Needs WA Response</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{needsWaResponseCount}</div>
            <p className="text-xs text-content-secondary">
              {needsWaResponseCount > 0 ? `${needsWaResponseCount} unanswered messages` : 'All messages answered'}
            </p>
          </div>

          {/* Card 4: Pending Form Reviews */}
          <div
            onClick={() => navigate('/lead-forms/review')}
            className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 space-y-3 hover:border-amber-300 hover:shadow-saas cursor-pointer transition-all duration-150 ease-in-out group shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary group-hover:text-navy-900 transition-colors">Pending Reviews</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-status-warning flex items-center justify-center shrink-0">
                <Inbox className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-navy-900 tracking-tight">{pendingFormCount}</div>
            <p className="text-xs text-content-secondary">
              {pendingFormCount > 0 ? `${pendingFormCount} form submissions awaiting review` : 'Review Inbox empty'}
            </p>
          </div>

          {/* Card 4: Hot Leads At Risk */}
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

          {/* Card 5: Unassigned Leads */}
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
        </div>
      </section>

      {/* C. SECONDARY REVENUE & PIPELINE SUMMARY ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-content-secondary">Total Active Leads</span>
            <div className="text-2xl font-bold text-navy-900 mt-1">{totalActiveLeads}</div>
            <span className="text-[11px] text-content-muted">Active opportunities in pipeline</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-content-secondary">Active Pipeline Value</span>
            <div className="text-2xl font-bold text-navy-900 mt-1">
              {currentWorkspace?.currency || 'USD'} {pipelineTotalValue.toLocaleString()}
            </div>
            <span className="text-[11px] text-content-muted">Total value of open opportunities</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-card p-5 rounded-2xl border border-surface-border/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-content-secondary">Closed Won Deals</span>
            <div className="text-2xl font-bold text-navy-900 mt-1">
              {wonCount} <span className="text-xs font-normal text-content-secondary">({currentWorkspace?.currency || 'USD'} {wonTotalValue.toLocaleString()})</span>
            </div>
            <span className="text-[11px] text-content-muted">Successfully closed opportunities</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-status-warning flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* D. PRIORITY ACTIONS TABLE & MOBILE CARDS */}
      <Card
        title="Priority Work Queue"
        subtitle="Operational leads and follow-ups requiring attention first."
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
          <div className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
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

            {/* Mobile Responsive Cards */}
            <div className="lg:hidden space-y-3">
              {attentionItems.slice(0, 6).map((item) => (
                <div key={item.lead_id} className="p-4 bg-slate-50/70 border border-surface-border/80 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span onClick={() => navigate(`/leads/${item.lead_id}`)} className="font-bold text-navy-900 text-sm hover:text-brand-blue cursor-pointer">
                      {item.lead_name}
                    </span>
                    <Badge variant={getUrgencyBadgeVariant(item.urgency_level)} size="sm">
                      {item.urgency_level}
                    </Badge>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-surface-border/60">
                    <div>
                      <span className="text-[11px] text-content-muted block font-medium">Issue</span>
                      <span className="font-semibold text-navy-900">{item.primary_issue_label}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-content-muted block font-medium">Next Action</span>
                      <span className="text-content-secondary">{item.next_action}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<PhoneCall className="w-3 h-3 text-brand-blue" />}
                      onClick={() => navigate(`/leads/${item.lead_id}`)}
                    >
                      Open Lead
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* E. PIPELINE OVERVIEW & TEAM WORKLOAD */}
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

            {/* 2-Column Compact Stage Grid */}
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
    </div>
  )
}
