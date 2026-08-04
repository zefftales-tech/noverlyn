import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import {
  revenueRecoveryApi,
  type RevenueRecoveryItem,
} from '../../lib/revenueRecoveryApi'
import { whatsappInboxApi } from '../../lib/whatsappInboxApi'
import {
  Sparkles,
  Flame,
  AlertTriangle,
  DollarSign,
  CheckCircle2,
  Copy,
  Send,
  RefreshCw,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'

export const RevenueRecoveryPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [items, setItems] = useState<RevenueRecoveryItem[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'waiting' | 'overdue' | 'high_intent' | 'no_action' | 'objections' | 'snoozed' | 'completed'>('all')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const filterStatus = activeTab === 'snoozed' ? 'snoozed' : activeTab === 'completed' ? 'completed' : undefined
      const data = await revenueRecoveryApi.getRecoveryItems(currentWorkspace.id, { status: filterStatus })
      setItems(data)
    } catch (err) {
      console.error('Failed to load recovery items:', err)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, activeTab])

  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(() => {
      if (isMounted) loadData()
    }, 0)
    return () => { isMounted = false; clearTimeout(timer) }
  }, [loadData])

  const handleRunScan = async () => {
    if (!currentWorkspace) return
    setScanning(true)
    try {
      const res = await revenueRecoveryApi.runScan(currentWorkspace.id)
      alert(`Scan complete: ${res.detected_items_count} recovery items identified or updated.`)
      await loadData()
    } catch (err: unknown) {
      console.error('Scan failed:', err)
      alert('Failed to run revenue recovery scan.')
    } finally {
      setScanning(false)
    }
  }

  const handleComplete = async (itemId: string) => {
    setActionLoadingId(itemId)
    try {
      await revenueRecoveryApi.completeItem(itemId, 'Resolved via recovery action')
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleSnooze = async (itemId: string) => {
    setActionLoadingId(itemId)
    try {
      await revenueRecoveryApi.snoozeItem(itemId)
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleDismiss = async (itemId: string) => {
    setActionLoadingId(itemId)
    try {
      await revenueRecoveryApi.dismissItem(itemId)
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleSendReply = async (item: RevenueRecoveryItem) => {
    if (!currentWorkspace || !item.conversation_id || !item.suggested_message) return
    setActionLoadingId(item.id)
    try {
      await whatsappInboxApi.sendReplyMessage({
        workspace_id: currentWorkspace.id,
        conversation_id: item.conversation_id,
        text_body: item.suggested_message,
      })
      await revenueRecoveryApi.completeItem(item.id, 'Sent suggested WhatsApp follow-up reply')
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      alert('Follow-up reply sent successfully via WhatsApp!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply'
      alert(`Error sending reply: ${msg}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const copyMessageText = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filter items for current tab
  const filteredItems = items.filter((item) => {
    if (activeTab === 'critical') return item.urgency === 'critical'
    if (activeTab === 'waiting') return item.risk_type === 'customer_waiting_for_reply' || item.risk_type === 'unanswered_customer_message'
    if (activeTab === 'overdue') return item.risk_type === 'overdue_follow_up'
    if (activeTab === 'high_intent') return item.risk_type === 'strong_buying_signal_no_action' || item.risk_type === 'high_intent_lead_inactive'
    if (activeTab === 'no_action') return item.risk_type === 'no_next_action'
    if (activeTab === 'objections') return item.risk_type === 'unresolved_objection'
    return true
  })

  // KPI Calculations
  const criticalCount = items.filter((i) => i.urgency === 'critical').length
  const totalValue = items.reduce((acc, i) => acc + (i.estimated_value || 0), 0)

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              Phase 10C AI Revenue Engine
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-navy-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" /> Revenue Recovery & Follow-up Engine
          </h1>
          <p className="text-xs text-content-secondary mt-0.5">
            Detect missed customer inquiries, unaddressed objections, overdue follow-ups, and recover potential revenue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunScan}
            isLoading={scanning}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />}
          >
            Scan & Detect Risks
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-surface-border shadow-xs space-y-1">
          <span className="text-xs text-content-secondary flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Total Risks Identified
          </span>
          <p className="text-2xl font-bold text-navy-900">{items.length}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-surface-border shadow-xs space-y-1">
          <span className="text-xs text-content-secondary flex items-center gap-1 font-medium">
            <Flame className="w-3.5 h-3.5 text-rose-500" /> Critical Attention Needed
          </span>
          <p className="text-2xl font-bold text-rose-600">{criticalCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-surface-border shadow-xs space-y-1">
          <span className="text-xs text-content-secondary flex items-center gap-1 font-medium">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Potential Value at Risk
          </span>
          <p className="text-2xl font-bold text-emerald-700">
            {totalValue > 0 ? `$${totalValue.toLocaleString()}` : 'N/A'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-surface-border shadow-xs space-y-1">
          <span className="text-xs text-content-secondary flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Mode
          </span>
          <p className="text-sm font-bold text-indigo-900">Suggest Only (Human Review)</p>
        </div>
      </div>

      {/* Tabbed Filters */}
      <div className="flex items-center gap-1 border-b border-surface-border overflow-x-auto pb-1 text-xs">
        {[
          { key: 'all', label: `All Risks (${items.length})` },
          { key: 'critical', label: `🔥 Critical (${criticalCount})` },
          { key: 'waiting', label: '⏳ Customer Waiting' },
          { key: 'overdue', label: '📅 Overdue Follow-ups' },
          { key: 'high_intent', label: '⚡ High Intent Inactive' },
          { key: 'no_action', label: '🎯 No Next Action' },
          { key: 'objections', label: '🛡️ Unresolved Objections' },
          { key: 'snoozed', label: '⏰ Snoozed' },
          { key: 'completed', label: '✅ Completed' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-3 py-2 rounded-t-lg font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 font-bold'
                : 'border-transparent text-content-secondary hover:text-navy-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recovery Items List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-content-secondary">Loading revenue recovery items...</div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <div className="py-12 text-center text-xs text-content-muted space-y-2">
              <ShieldCheck className="w-8 h-8 mx-auto text-emerald-600" />
              <p className="font-bold text-navy-900 text-sm">No revenue risks found in this category.</p>
              <p className="text-content-secondary max-w-sm mx-auto">
                All customer inquiries and follow-ups are up to date! Run a scan anytime to re-evaluate workspace activity.
              </p>
            </div>
          </Card>
        ) : (
          filteredItems.map((item) => {
            const isLoading = actionLoadingId === item.id
            return (
              <Card key={item.id} className="p-4 space-y-3 border-l-4 border-l-indigo-600 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-surface-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-navy-900">
                      {item.lead?.full_name || item.conversation?.contact_name || item.conversation?.contact_phone || 'Customer'}
                    </span>
                    <Badge
                      variant={item.urgency === 'critical' ? 'critical' : item.urgency === 'high' ? 'warning' : 'neutral'}
                      size="sm"
                    >
                      {item.urgency.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-content-secondary font-mono">
                      Detected: {new Date(item.detected_at).toLocaleString()}
                    </span>
                  </div>

                  {item.estimated_value && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Est. Value: ${item.estimated_value.toLocaleString()} USD
                    </span>
                  )}
                </div>

                {/* Risk Title & Reason */}
                <div className="space-y-1">
                  <h4 className="font-bold text-navy-900 text-sm flex items-center gap-1.5">
                    {item.title}
                  </h4>
                  <p className="text-xs text-content-secondary leading-relaxed">{item.reason}</p>
                </div>

                {/* Recommended Action */}
                <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-100 text-xs space-y-1">
                  <span className="font-bold text-indigo-900 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Recommended Action:
                  </span>
                  <p className="text-indigo-950 font-medium">{item.recommended_action}</p>
                </div>

                {/* Suggested Message Preview */}
                {item.suggested_message && (
                  <div className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300 flex items-center gap-1 text-[11px]">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> AI Suggested Follow-up Reply
                      </span>
                      <button
                        onClick={() => copyMessageText(item.id, item.suggested_message || '')}
                        className="text-slate-400 hover:text-white text-[10px] flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedId === item.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-slate-200 leading-relaxed italic">"{item.suggested_message}"</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-border/60">
                  <div className="flex items-center gap-2">
                    {item.conversation_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/whatsapp/inbox?conversation_id=${item.conversation_id}`)}
                        icon={<MessageSquare className="w-3.5 h-3.5 text-brand-blue" />}
                      >
                        Open Inbox
                      </Button>
                    )}

                    {item.conversation_id && item.suggested_message && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSendReply(item)}
                        isLoading={isLoading}
                        icon={<Send className="w-3.5 h-3.5" />}
                      >
                        Send After Review
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSnooze(item.id)}
                      disabled={isLoading}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                      Snooze 24h
                    </button>

                    <button
                      onClick={() => handleDismiss(item.id)}
                      disabled={isLoading}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                      Dismiss
                    </button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleComplete(item.id)}
                      isLoading={isLoading}
                      icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    >
                      Complete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
