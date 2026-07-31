import React, { useEffect, useState, useCallback } from 'react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { LoadingState } from '../components/ui/LoadingState'
import { useWorkspace } from '../hooks/useWorkspace'
import { supabase } from '../lib/supabase'
import { leadsApi } from '../lib/leadsApi'
import type { Database } from '../types/database.types'
import { AlertTriangle } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']
type FollowUp = Database['public']['Tables']['follow_ups']['Row']

type DateRange = '7d' | '30d' | 'this_month' | 'custom'

export const InsightsPage: React.FC = () => {
  const { currentWorkspace, currentRole } = useWorkspace()

  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Insights Data States
  const [pipelineDist, setPipelineDist] = useState<Array<{ stage: string; count: number; value: number }>>([])
  const [wonCount, setWonCount] = useState<number>(0)
  const [lostCount, setLostCount] = useState<number>(0)
  const [lostReasons, setLostReasons] = useState<Record<string, number>>({})
  const [sourcesStats, setSourcesStats] = useState<Array<{ source: string; created: number; won: number; lost: number; rate: number }>>([])
  const [followUpStats, setFollowUpStats] = useState<{ completed: number; overdue: number; dueToday: number }>({
    completed: 0,
    overdue: 0,
    dueToday: 0,
  })
  const [agentStats, setAgentStats] = useState<Array<{ name: string; active: number; completed: number; overdue: number; won: number }>>([])

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'
  const currency = currentWorkspace?.currency || 'USD'

  const computeDateBoundaries = useCallback(() => {
    const now = new Date()
    let startDate = new Date()

    if (dateRange === '7d') {
      startDate.setDate(now.getDate() - 7)
    } else if (dateRange === '30d') {
      startDate.setDate(now.getDate() - 30)
    } else if (dateRange === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (dateRange === 'custom' && customStart) {
      startDate = new Date(customStart)
    }

    const endDate = dateRange === 'custom' && customEnd ? new Date(customEnd) : now
    return { startDate, endDate }
  }, [dateRange, customStart, customEnd])

  const loadInsights = useCallback(async () => {
    if (!currentWorkspace || !supabase) return
    setLoading(true)
    setError(null)

    try {
      const { startDate, endDate } = computeDateBoundaries()

      // 1. Fetch all workspace leads
      const { data: leadsData, error: lErr } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)

      if (lErr) throw lErr
      const leads = (leadsData || []) as Lead[]

      // 2. Fetch all workspace follow ups
      const { data: fuData, error: fErr } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)

      if (fErr) throw fErr
      const followUps = (fuData || []) as FollowUp[]

      // 3. Fetch workspace members
      const { data: memsData } = await supabase
        .from('workspace_members')
        .select('user_id, profile:profiles(full_name)')
        .eq('workspace_id', currentWorkspace.id)

      const mems = (memsData as unknown) as Array<{ user_id: string; profile: { full_name: string } | null }> | null

      // INSIGHT 1: PIPELINE DISTRIBUTION (Current Snapshot)
      const wsBusinessType = (currentWorkspace as unknown as { business_type?: string })?.business_type
      const pipelineStages = await leadsApi.getPipelineStages(currentWorkspace.id, wsBusinessType)

      const stageMap: Record<string, { count: number; value: number }> = {}
      pipelineStages.forEach((s) => {
        stageMap[s.stage_key] = { count: 0, value: 0 }
      })

      leads.forEach((l) => {
        if (!stageMap[l.stage]) {
          stageMap[l.stage] = { count: 0, value: 0 }
        }
        stageMap[l.stage].count += 1
        stageMap[l.stage].value += l.estimated_value || 0
      })

      const dist = Object.entries(stageMap).map(([stage, data]) => ({
        stage,
        count: data.count,
        value: data.value,
      }))
      setPipelineDist(dist)

      // INSIGHT 2: WON VS LOST (Filtered by won_at and lost_at)
      const wonLeads = leads.filter((l) => l.won_at && new Date(l.won_at) >= startDate && new Date(l.won_at) <= endDate)
      const lostLeads = leads.filter((l) => l.lost_at && new Date(l.lost_at) >= startDate && new Date(l.lost_at) <= endDate)
      setWonCount(wonLeads.length)
      setLostCount(lostLeads.length)

      // INSIGHT 3: LOST LEAD REASONS (Filtered by lost_at)
      const reasons: Record<string, number> = {}
      lostLeads.forEach((l) => {
        if (l.lost_reason) {
          reasons[l.lost_reason] = (reasons[l.lost_reason] || 0) + 1
        }
      })
      setLostReasons(reasons)

      // INSIGHT 4: LEAD SOURCE PERFORMANCE (Cohort by created_at)
      const sourceMap: Record<string, { created: number; won: number; lost: number }> = {}
      const cohortLeads = leads.filter((l) => new Date(l.created_at) >= startDate && new Date(l.created_at) <= endDate)

      cohortLeads.forEach((l) => {
        const src = l.source || 'Other'
        if (!sourceMap[src]) {
          sourceMap[src] = { created: 0, won: 0, lost: 0 }
        }
        sourceMap[src].created += 1
        if (l.status === 'won') sourceMap[src].won += 1
        if (l.status === 'lost') sourceMap[src].lost += 1
      })

      const sStats = Object.entries(sourceMap).map(([source, d]) => {
        const rate = d.created > 0 ? Math.round((d.won / d.created) * 100) : 0
        return { source, created: d.created, won: d.won, lost: d.lost, rate }
      })
      setSourcesStats(sStats)

      // INSIGHT 5: FOLLOW-UP PERFORMANCE (Factual Counts)
      const now = new Date()
      const completedCount = followUps.filter(
        (f) => f.status === 'completed' && f.completed_at && new Date(f.completed_at) >= startDate && new Date(f.completed_at) <= endDate
      ).length

      const overdueCount = followUps.filter((f) => f.status === 'scheduled' && new Date(f.scheduled_at) < now).length
      const dueTodayCount = followUps.filter(
        (f) => f.status === 'scheduled' && new Date(f.scheduled_at) >= now && new Date(f.scheduled_at).toDateString() === now.toDateString()
      ).length

      setFollowUpStats({ completed: completedCount, overdue: overdueCount, dueToday: dueTodayCount })

      // INSIGHT 6: AGENT OPERATIONS (Owner/Manager Only)
      if (mems) {
        const aStats = mems.map((m) => {
          const prof = m.profile
          const userLeads = leads.filter((l) => l.assigned_to === m.user_id)
          const activeCount = userLeads.filter((l) => l.status === 'active').length
          const userWon = userLeads.filter((l) => l.status === 'won').length

          const userFus = followUps.filter((f) => f.assigned_to === m.user_id)
          const userCompleted = userFus.filter(
            (f) => f.status === 'completed' && f.completed_at && new Date(f.completed_at) >= startDate && new Date(f.completed_at) <= endDate
          ).length
          const userOverdue = userFus.filter((f) => f.status === 'scheduled' && new Date(f.scheduled_at) < now).length

          return {
            name: prof?.full_name || 'Agent',
            active: activeCount,
            completed: userCompleted,
            overdue: userOverdue,
            won: userWon,
          }
        })
        setAgentStats(aStats)
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load operational insights'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, computeDateBoundaries])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadInsights()
    })
  }, [loadInsights])

  const totalWonLost = wonCount + lostCount
  const winRate = totalWonLost > 0 ? Math.round((wonCount / totalWonLost) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl text-navy-900">Operational Insights</h1>
            <Badge variant="success" className="font-bold">Phase 4 Analytics</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Factual decision-oriented operational reports for <span className="font-semibold text-navy-900">{currentWorkspace?.name}</span>
          </p>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            options={[
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
              { value: 'this_month', label: 'This Month' },
              { value: 'custom', label: 'Custom Date Range' },
            ]}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
          />

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span className="text-xs text-content-muted">to</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Card><LoadingState label="Calculating operational insights..." /></Card>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: WON VS LOST & CONVERSION */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-1 shadow-2xs">
              <span className="text-xs font-semibold text-content-secondary">Total Won Deals</span>
              <div className="text-2xl font-bold font-heading text-emerald-600">{wonCount}</div>
              <p className="text-[11px] text-content-muted">Filtered by won_at timestamp</p>
            </div>

            <div className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-1 shadow-2xs">
              <span className="text-xs font-semibold text-content-secondary">Total Lost Deals</span>
              <div className="text-2xl font-bold font-heading text-status-critical">{lostCount}</div>
              <p className="text-[11px] text-content-muted">Filtered by lost_at timestamp</p>
            </div>

            <div className="bg-surface-card p-4 rounded-xl border border-surface-border space-y-1 shadow-2xs">
              <span className="text-xs font-semibold text-content-secondary">Resolved Conversion Rate</span>
              <div className="text-2xl font-bold font-heading text-navy-900">{winRate}%</div>
              <p className="text-[11px] text-content-muted">Won Deals / Total Resolved (Won + Lost)</p>
            </div>
          </div>

          {/* SECTION 2: PIPELINE STAGE DISTRIBUTION */}
          <Card title="Current Pipeline Distribution" subtitle="Snapshot of active lead volume and deal value per pipeline stage">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {pipelineDist.map((item) => (
                <div key={item.stage} className="p-3 bg-slate-50 border border-surface-border rounded-lg text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-content-secondary block truncate">
                    {item.stage.replace('_', ' ')}
                  </span>
                  <span className="text-lg font-bold font-heading text-navy-900 block">{item.count}</span>
                  <span className="text-[10px] font-semibold text-content-muted block">
                    {currency} {item.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* SECTION 3 & 4: LOST REASONS & LEAD SOURCE PERFORMANCE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LOST REASONS BREAKDOWN */}
            <Card title="Root-Cause Lost Deal Analysis" subtitle="Distribution of why property deals die (filtered by lost_at)">
              {Object.keys(lostReasons).length === 0 ? (
                <div className="p-6 text-center text-xs text-content-muted bg-slate-50 border border-dashed rounded-lg">
                  Not enough lost deal records in this period to calculate root cause analysis.
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  {Object.entries(lostReasons).map(([reason, count]) => {
                    const pct = lostCount > 0 ? Math.round((count / lostCount) * 100) : 0
                    return (
                      <div key={reason} className="space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span className="text-navy-900 uppercase text-[11px]">{reason.replace('_', ' ')}</span>
                          <span className="text-content-muted">{count} deals ({pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-status-critical rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* LEAD SOURCE PERFORMANCE */}
            <Card title="Lead Source Conversion" subtitle="Cohort created in period vs eventual won/lost outcomes">
              {sourcesStats.length === 0 ? (
                <div className="p-6 text-center text-xs text-content-muted bg-slate-50 border border-dashed rounded-lg">
                  No leads created in this selected date period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-surface-border text-content-secondary font-semibold uppercase text-[10px]">
                        <th className="pb-2">Source</th>
                        <th className="pb-2 text-center">Created</th>
                        <th className="pb-2 text-center">Won</th>
                        <th className="pb-2 text-center">Lost</th>
                        <th className="pb-2 text-right">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {sourcesStats.map((src) => (
                        <tr key={src.source} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 font-bold text-navy-900">{src.source}</td>
                          <td className="py-2 text-center font-semibold text-navy-900">{src.created}</td>
                          <td className="py-2 text-center font-bold text-emerald-600">{src.won}</td>
                          <td className="py-2 text-center font-bold text-status-critical">{src.lost}</td>
                          <td className="py-2 text-right font-bold text-navy-900">{src.rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* SECTION 5: FOLLOW-UP PERFORMANCE COUNTS */}
          <Card title="Follow-up Operational Performance" subtitle="Factual touchpoint task metrics across workspace">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 border border-surface-border rounded-xl space-y-1">
                <span className="text-content-secondary font-medium">Follow-ups Completed</span>
                <div className="text-2xl font-bold font-heading text-emerald-600">{followUpStats.completed}</div>
                <p className="text-[11px] text-content-muted">Completed in selected date range</p>
              </div>

              <div className="p-4 bg-slate-50 border border-surface-border rounded-xl space-y-1">
                <span className="text-content-secondary font-medium">Currently Overdue Tasks</span>
                <div className="text-2xl font-bold font-heading text-status-critical">{followUpStats.overdue}</div>
                <p className="text-[11px] text-content-muted">Scheduled actions past current time</p>
              </div>

              <div className="p-4 bg-slate-50 border border-surface-border rounded-xl space-y-1">
                <span className="text-content-secondary font-medium">Due Today Tasks</span>
                <div className="text-2xl font-bold font-heading text-brand-blue">{followUpStats.dueToday}</div>
                <p className="text-[11px] text-content-muted">Scheduled for workspace business day</p>
              </div>
            </div>
          </Card>

          {/* SECTION 6: AGENT OPERATIONS (Owner/Manager Only) */}
          {isOwnerOrManager && (
            <Card title="Agent Operations Overview" subtitle="Factual per-agent operational task performance">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border bg-slate-50 text-content-secondary font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Agent Name</th>
                      <th className="p-3 text-center">Active Assigned Leads</th>
                      <th className="p-3 text-center">Completed Follow-ups</th>
                      <th className="p-3 text-center">Overdue Tasks</th>
                      <th className="p-3 text-center">Won Deals</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {agentStats.map((agent, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-navy-900">{agent.name}</td>
                        <td className="p-3 text-center font-bold text-navy-900">{agent.active}</td>
                        <td className="p-3 text-center font-bold text-emerald-600">{agent.completed}</td>
                        <td className="p-3 text-center font-bold text-status-critical">{agent.overdue}</td>
                        <td className="p-3 text-center font-bold text-navy-900">{agent.won}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
