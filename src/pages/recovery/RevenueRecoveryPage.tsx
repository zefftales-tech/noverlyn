import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useWorkspace } from '../../hooks/useWorkspace'
import {
  revenueRecoveryApi,
  type RevenueRecoveryItem,
  type GroupedRecoveryCard,
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
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react'

export const RevenueRecoveryPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [rawItems, setRawItems] = useState<RevenueRecoveryItem[]>([])
  const [groupedCards, setGroupedCards] = useState<GroupedRecoveryCard[]>([])
  const [activeTab, setActiveTab] = useState<
    'all' | 'act_now' | 'waiting' | 'overdue' | 'high_intent' | 'no_action' | 'objections' | 'snoozed' | 'completed' | 'dismissed'
  >('all')
  const [showMoreFilter, setShowMoreFilter] = useState(false)
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const filterStatus =
        activeTab === 'snoozed'
          ? 'snoozed'
          : activeTab === 'completed'
          ? 'completed'
          : activeTab === 'dismissed'
          ? 'dismissed'
          : undefined

      const data = await revenueRecoveryApi.getRecoveryItems(currentWorkspace.id, { status: filterStatus })
      setRawItems(data)

      const cards = revenueRecoveryApi.groupItemsByCustomer(data)
      setGroupedCards(cards)
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
      await loadData()
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
      await loadData()
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
      await loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoadingId(null)
    }
  }

  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())

  const handleSendReply = async (item: RevenueRecoveryItem) => {
    if (!currentWorkspace || !item.conversation_id || !item.suggested_message) return
    if (sendingIds.has(item.id)) return

    setSendingIds((prev) => new Set(prev).add(item.id))
    setActionLoadingId(item.id)
    try {
      if (import.meta.env.DEV) {
        console.log('[Recovery Send Reply]', {
          recovery_item_id: item.id,
          conversation_id: item.conversation_id,
          workspace_id: currentWorkspace.id,
          has_suggested_message: true,
        })
      }

      await whatsappInboxApi.sendReplyMessage({
        workspace_id: currentWorkspace.id,
        conversation_id: item.conversation_id,
        text_body: item.suggested_message,
      })
      await revenueRecoveryApi.completeItem(item.id, 'Reply sent from Revenue Recovery')
      await loadData()
      alert('Reply sent successfully via WhatsApp!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply'
      alert(`Error sending reply: ${msg}`)
    } finally {
      setActionLoadingId(null)
      setSendingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const copyMessageText = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filter Grouped Cards
  const filteredCards = groupedCards.filter((card) => {
    if (activeTab === 'act_now') return card.priority_band === 'act_now'
    if (activeTab === 'waiting') return card.all_items.some((i) => i.risk_type === 'customer_waiting_for_reply')
    if (activeTab === 'overdue') return card.all_items.some((i) => i.risk_type === 'overdue_follow_up')
    if (activeTab === 'high_intent') return card.all_items.some((i) => i.risk_type === 'strong_buying_signal_no_action' || i.risk_type === 'high_intent_lead_inactive')
    if (activeTab === 'no_action') return card.all_items.some((i) => i.risk_type === 'no_next_action')
    if (activeTab === 'objections') return card.all_items.some((i) => i.risk_type === 'unresolved_objection')
    return true
  })

  // Categorize cards by priority section
  const actNowCards = filteredCards.filter((c) => c.priority_band === 'act_now')
  const followUpTodayCards = filteredCards.filter((c) => c.priority_band === 'high_priority')
  const planNextActionCards = filteredCards.filter((c) => ['follow_up_soon', 'monitor'].includes(c.priority_band))

  // KPI Metrics
  const waitingCount = rawItems.filter((i) => i.risk_type === 'customer_waiting_for_reply').length
  const overdueCount = rawItems.filter((i) => i.risk_type === 'overdue_follow_up').length
  const actNowCount = groupedCards.filter((c) => c.priority_band === 'act_now').length
  const totalValue = rawItems.reduce((sum, i) => sum + (i.estimated_value || 0), 0)

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              Phase 10C.1 Launch Hardened Action Center
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-navy-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" /> Revenue Recovery & Follow-up Engine
          </h1>
          <p className="text-xs text-content-secondary mt-0.5">
            Prioritized customer action center: Grouped by lead, scored 0–100, contextual replies, and noise suppression.
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

      {/* Polish KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 shadow-xs space-y-1">
          <span className="text-xs text-rose-800 flex items-center gap-1 font-semibold">
            <Flame className="w-3.5 h-3.5 text-rose-600" /> 🔥 Act Now Needed
          </span>
          <p className="text-2xl font-bold text-rose-700">{actNowCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-xs space-y-1">
          <span className="text-xs text-amber-800 flex items-center gap-1 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> ⏳ Customers Waiting
          </span>
          <p className="text-2xl font-bold text-amber-700">{waitingCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 shadow-xs space-y-1">
          <span className="text-xs text-indigo-800 flex items-center gap-1 font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> 📅 Follow-Ups Overdue
          </span>
          <p className="text-2xl font-bold text-indigo-700">{overdueCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-surface-border shadow-xs space-y-1">
          <span className="text-xs text-content-secondary flex items-center gap-1 font-medium">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Potential Value at Risk
          </span>
          {totalValue > 0 ? (
            <p className="text-2xl font-bold text-emerald-700">${totalValue.toLocaleString()} USD</p>
          ) : (
            <div>
              <p className="text-sm font-bold text-content-secondary">Value Not Tracked</p>
              <button
                onClick={() => navigate('/leads')}
                className="text-[11px] font-semibold text-brand-blue hover:underline flex items-center gap-0.5 mt-0.5"
              >
                <Plus className="w-3 h-3" /> Add estimated lead values
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Responsive Filter Bar */}
      <div className="flex items-center justify-between border-b border-surface-border pb-1 overflow-x-auto text-xs gap-2">
        <div className="flex items-center gap-1">
          {[
            { key: 'all', label: `All Open (${groupedCards.length})` },
            { key: 'act_now', label: `🔥 Act Now (${actNowCount})` },
            { key: 'waiting', label: `⏳ Waiting (${waitingCount})` },
            { key: 'overdue', label: `📅 Overdue (${overdueCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-navy-900 text-white font-bold shadow-xs'
                  : 'text-content-secondary hover:text-navy-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* More Filters Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMoreFilter(!showMoreFilter)}
              className="px-3 py-1.5 rounded-lg font-medium text-content-secondary hover:text-navy-900 hover:bg-slate-100 flex items-center gap-1"
            >
              More <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showMoreFilter && (
              <div className="absolute left-0 mt-1 w-48 bg-white border border-surface-border rounded-xl shadow-lg z-20 p-1 space-y-1">
                {[
                  { key: 'no_action', label: '🎯 No Next Action' },
                  { key: 'objections', label: '🛡️ Unresolved Objections' },
                  { key: 'snoozed', label: '⏰ Snoozed Items' },
                  { key: 'completed', label: '✅ Completed History' },
                  { key: 'dismissed', label: '✕ Dismissed' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveTab(item.key as typeof activeTab)
                      setShowMoreFilter(false)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-navy-900 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action-First Sectioned Layout */}
      {loading ? (
        <div className="py-12 text-center text-xs text-content-secondary">Loading prioritized recovery cards...</div>
      ) : filteredCards.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-xs text-content-muted space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-600" />
            <p className="font-bold text-navy-900 text-sm">No active revenue risks in this category.</p>
            <p className="text-content-secondary max-w-sm mx-auto">
              All customer follow-ups and inquiries are up to date!
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: ACT NOW */}
          {actNowCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-rose-700 border-b border-rose-200 pb-2">
                <Flame className="w-5 h-5 text-rose-600" />
                <h2 className="font-bold text-base text-navy-900">Act Now ({actNowCards.length})</h2>
                <span className="text-xs text-content-secondary font-normal">
                  Immediate attention required within 30 minutes
                </span>
              </div>
              <div className="space-y-4">
                {actNowCards.map((card) => renderRecoveryCard(card))}
              </div>
            </div>
          )}

          {/* SECTION 2: FOLLOW UP TODAY */}
          {followUpTodayCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-700 border-b border-amber-200 pb-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-base text-navy-900">Follow Up Today ({followUpTodayCards.length})</h2>
              </div>
              <div className="space-y-4">
                {followUpTodayCards.map((card) => renderRecoveryCard(card))}
              </div>
            </div>
          )}

          {/* SECTION 3: PLAN NEXT ACTION */}
          {planNextActionCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 border-b border-indigo-200 pb-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-base text-navy-900">Plan Next Action ({planNextActionCards.length})</h2>
              </div>
              <div className="space-y-4">
                {planNextActionCards.map((card) => renderRecoveryCard(card))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Card Component Renderer
  function renderRecoveryCard(card: GroupedRecoveryCard) {
    const item = card.primary_item
    const isLoading = actionLoadingId === item.id
    const isExpanded = expandedGroupKey === card.group_key

    return (
      <Card key={card.group_key} className="p-4 space-y-3 border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-surface-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-navy-900">{card.customer_name}</span>

            {/* Score & Band Badge */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                card.priority_band === 'act_now'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : card.priority_band === 'high_priority'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
              }`}
            >
              Score: {card.highest_priority_score} — {card.priority_band.replace('_', ' ').toUpperCase()}
            </span>

            {card.has_possible_duplicates && (
              <Badge variant="warning" size="sm">
                Possible Duplicate Record
              </Badge>
            )}
          </div>

          {card.estimated_value && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Est. Value: ${card.estimated_value.toLocaleString()} USD
            </span>
          )}
        </div>

        {/* Explainable Reason */}
        <div className="p-2.5 rounded-lg bg-slate-100/80 border border-slate-200 text-xs space-y-0.5">
          <span className="font-bold text-navy-900">Why it matters:</span>
          <p className="text-slate-700 leading-relaxed">{card.priority_reason}</p>
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
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Contextual Suggested Reply
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

        {/* Expandable Secondary Signals */}
        {card.all_items.length > 1 && (
          <div className="pt-1">
            <button
              onClick={() => setExpandedGroupKey(isExpanded ? null : card.group_key)}
              className="text-xs font-semibold text-brand-blue hover:underline flex items-center gap-1"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {isExpanded ? 'Hide' : `+ ${card.all_items.length - 1} additional signals for ${card.customer_name}`}
            </button>

            {isExpanded && (
              <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-2">
                {card.all_items.slice(1).map((sec) => (
                  <div key={sec.id} className="text-xs text-slate-700 bg-slate-50 p-2 rounded-md border border-slate-200">
                    <span className="font-bold text-navy-900">{sec.title}:</span> {sec.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unlinked WhatsApp Conversation Warning */}
        {!item.conversation_id && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
            WhatsApp conversation is not linked to this lead. Open the lead and connect or link its WhatsApp conversation first.
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-border/60">
          <div className="flex items-center gap-2">
            {item.conversation_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/whatsapp/inbox?conversation=${item.conversation_id}`)}
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
                isLoading={isLoading || sendingIds.has(item.id)}
                disabled={!item.conversation_id || sendingIds.has(item.id)}
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
  }
}
