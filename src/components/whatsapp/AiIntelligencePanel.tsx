import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  CheckCircle2,
  Copy,
  Send,
  RefreshCw,
  Flame,
  ThermometerSun,
  Snowflake,
  HelpCircle,
  Target,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  FileEdit,
} from 'lucide-react'
import {
  aiIntelligenceApi,
  type AiConversationAnalysis,
  type AiLeadSuggestion,
} from '../../lib/aiIntelligenceApi'
import { whatsappInboxApi } from '../../lib/whatsappInboxApi'

interface AiIntelligencePanelProps {
  workspaceId: string
  conversationId: string
  contactPhone: string
  contactName?: string | null
  onInsertReply?: (text: string) => void
  onEvidenceClick?: (messageId: string) => void
  onCloseMobileDrawer?: () => void
}

export const AiIntelligencePanel: React.FC<AiIntelligencePanelProps> = ({
  workspaceId,
  conversationId,
  contactName,
  contactPhone,
  onInsertReply,
  onEvidenceClick,
  onCloseMobileDrawer,
}) => {
  const [analysis, setAnalysis] = useState<AiConversationAnalysis | null>(null)
  const [suggestions, setSuggestions] = useState<AiLeadSuggestion[]>([])
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [editableReplyText, setEditableReplyText] = useState('')
  const [createFollowUp] = useState(true)
  const [activeTab, setActiveTab] = useState<'insights' | 'suggestions' | 'reply'>('insights')
  const [copiedReply, setCopiedReply] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    understood: true,
    summary: true,
    score: true,
    intent: true,
    extracted: true,
    missing: true,
    signals: true,
    nextAction: true,
    reply: true,
  })

  useEffect(() => {
    let isCancelled = false
    const fetchLatest = async () => {
      setLoading(true)
      try {
        const latest = await aiIntelligenceApi.getLatestAnalysis(conversationId)
        if (isCancelled) return
        if (latest) {
          setAnalysis(latest)
          setEditableReplyText(latest.suggested_reply || '')
          const sugs = await aiIntelligenceApi.getSuggestions(latest.id)
          if (isCancelled) return
          setSuggestions(sugs)
          setSelectedSuggestionIds(sugs.filter((s) => s.status === 'pending').map((s) => s.id))
        } else {
          setAnalysis(null)
          setSuggestions([])
          setEditableReplyText('')
        }
      } catch (err) {
        console.error('Failed to load AI analysis:', err)
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }

    setTimeout(() => {
      fetchLatest()
    }, 0)

    return () => {
      isCancelled = true
    }
  }, [conversationId])

  const handleRunAnalysis = async (force = false) => {
    setLoading(true)
    try {
      const result = await aiIntelligenceApi.analyzeConversation({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        trigger_type: 'manual',
        force_reanalyze: force,
      })
      setAnalysis(result.analysis)
      setEditableReplyText(result.analysis.suggested_reply || '')
      setSuggestions(result.suggestions)
      setSelectedSuggestionIds(result.suggestions.filter((s) => s.status === 'pending').map((s) => s.id))
    } catch (err) {
      console.error('Analysis failed:', err)
      alert('Analysis failed. Please ensure the AI Provider configuration is complete.')
    } finally {
      setLoading(false)
    }
  }

  const handleApplySelected = async () => {
    if (!analysis || selectedSuggestionIds.length === 0) return
    setApplying(true)
    try {
      await aiIntelligenceApi.applySuggestions({
        analysis_id: analysis.id,
        suggestion_ids: selectedSuggestionIds,
        create_follow_up: createFollowUp,
      })
      alert('Approved suggestions applied successfully to lead!')
      await handleRunAnalysis(true)
    } catch (err) {
      console.error('Apply failed:', err)
      alert('Failed to apply suggestions.')
    } finally {
      setApplying(false)
    }
  }

  const handleSendReplyDirectly = async () => {
    if (!editableReplyText.trim()) return
    setSendingReply(true)
    try {
      await whatsappInboxApi.sendReplyMessage({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        text_body: editableReplyText.trim(),
      })
      alert('Reply sent successfully via WhatsApp!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send WhatsApp reply'
      alert(`Error sending reply: ${msg}`)
    } finally {
      setSendingReply(false)
    }
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const toggleSuggestionSelection = (id: string) => {
    setSelectedSuggestionIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const copyReplyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedReply(true)
    setTimeout(() => setCopiedReply(false), 2000)
  }

  const renderTemperatureBadge = (temp?: string | null) => {
    if (temp === 'hot') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Flame className="w-3.5 h-3.5 mr-1" /> Hot Lead
        </span>
      )
    }
    if (temp === 'warm') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <ThermometerSun className="w-3.5 h-3.5 mr-1" /> Warm Lead
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <Snowflake className="w-3.5 h-3.5 mr-1" /> Cold Lead
      </span>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 w-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center">
              AI Intelligence Engine
            </h3>
            <p className="text-xs text-slate-400">Multi-Industry Customer Qualification</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleRunAnalysis(true)}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Re-analyze Conversation"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          {onCloseMobileDrawer && (
            <button
              onClick={onCloseMobileDrawer}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/50 p-1 text-xs">
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all ${
            activeTab === 'insights'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Insights
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all relative ${
            activeTab === 'suggestions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Suggestions
          {suggestions.filter((s) => s.status === 'pending').length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold">
              {suggestions.filter((s) => s.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('reply')}
          className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all ${
            activeTab === 'reply'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          Suggested Reply
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {!analysis && !loading && (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-medium text-white">No AI Analysis Yet</h4>
            <p className="text-slate-400 max-w-xs mx-auto">
              Run AI conversation intelligence to extract structured requirements, lead score, missing details, and qualification replies.
            </p>
            <button
              onClick={() => handleRunAnalysis(false)}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-lg shadow-indigo-600/20"
            >
              Analyze Conversation Now
            </button>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
            <p className="text-slate-300 font-medium">Analyzing WhatsApp Conversation...</p>
            <p className="text-slate-500 text-[11px]">Extracting intent, requirement, budget, and qualification insights</p>
          </div>
        )}

        {analysis && !loading && (
          <>
            {/* TAB 1: INSIGHTS */}
            {activeTab === 'insights' && (
              <div className="space-y-4">
                {/* AI UNDERSTOOD CARD */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> AI Understood Context
                    </span>
                    {renderTemperatureBadge(analysis.lead_temperature)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                      <span className="text-slate-400 block text-[10px]">Customer</span>
                      <span className="font-semibold text-white">{contactName || contactPhone}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                      <span className="text-slate-400 block text-[10px]">Lead Score</span>
                      <span className="font-bold text-emerald-400 text-sm">{analysis.lead_score ?? 'N/A'}/100</span>
                    </div>

                    <div className="col-span-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                      <span className="text-slate-400 block text-[10px]">Requirement</span>
                      <span className="font-medium text-slate-200">{analysis.requirement_summary || 'Inquiry received'}</span>
                    </div>
                  </div>
                </div>

                {/* RECOMMENDED NEXT ACTION */}
                {analysis.recommended_next_action && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                    <span className="font-bold text-amber-400 flex items-center gap-1 text-[11px]">
                      <Target className="w-3.5 h-3.5" /> Recommended Next Action
                    </span>
                    <p className="text-slate-200 font-medium text-xs">{analysis.recommended_next_action}</p>
                    {analysis.recommended_action_reason && (
                      <p className="text-slate-400 text-[10px]">{analysis.recommended_action_reason}</p>
                    )}
                  </div>
                )}

                {/* MISSING INFORMATION */}
                {analysis.missing_information && Array.isArray(analysis.missing_information) && analysis.missing_information.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <button
                      onClick={() => toggleSection('missing')}
                      className="w-full flex items-center justify-between text-slate-300 font-semibold text-[11px]"
                    >
                      <span className="flex items-center gap-1.5 text-amber-400">
                        <HelpCircle className="w-3.5 h-3.5" /> Missing Qualification Details ({analysis.missing_information.length})
                      </span>
                      {expandedSections.missing ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {expandedSections.missing && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {analysis.missing_information.map((item, idx) => (
                          <span key={idx} className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]">
                            • {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* BUYING SIGNALS */}
                {analysis.buying_signals && Array.isArray(analysis.buying_signals) && analysis.buying_signals.length > 0 && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1 text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5" /> Buying Signals
                    </span>
                    <ul className="space-y-1 text-[11px] text-slate-300">
                      {analysis.buying_signals.map((signal, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SUGGESTIONS */}
            {activeTab === 'suggestions' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400 font-medium text-[11px]">
                    {suggestions.filter((s) => s.status === 'pending').length} Pending Suggestions
                  </span>
                  <button
                    onClick={handleApplySelected}
                    disabled={applying || selectedSuggestionIds.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Apply Selected ({selectedSuggestionIds.length})
                  </button>
                </div>

                {suggestions.length === 0 ? (
                  <p className="text-center py-6 text-slate-500">No suggestions available.</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((sug) => {
                      const isChecked = selectedSuggestionIds.includes(sug.id)
                      return (
                        <div
                          key={sug.id}
                          className={`p-3 rounded-xl border transition-all ${
                            isChecked
                              ? 'bg-slate-800/90 border-indigo-500/50 shadow-sm'
                              : 'bg-slate-900/60 border-slate-800 opacity-75'
                          }`}
                        >
                          <div className="flex items-start space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={sug.status !== 'pending'}
                              onChange={() => toggleSuggestionSelection(sug.id)}
                              className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white capitalize text-xs">
                                  {sug.target_field || sug.suggestion_type}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                                  {Math.round((sug.confidence || 0) * 100)}% confidence
                                </span>
                              </div>

                              <p className="text-indigo-300 font-medium text-[11px]">
                                {typeof sug.suggested_value === 'object'
                                  ? JSON.stringify(sug.suggested_value)
                                  : String(sug.suggested_value)}
                              </p>

                              {sug.evidence_text && (
                                <p className="text-slate-400 text-[10px] italic">"{sug.evidence_text}"</p>
                              )}

                              {Array.isArray(sug.evidence_message_ids) && sug.evidence_message_ids.length > 0 && onEvidenceClick && (
                                <button
                                  type="button"
                                  onClick={() => onEvidenceClick(sug.evidence_message_ids[0])}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-mono flex items-center gap-1 pt-1"
                                >
                                  🔍 Review Evidence Message
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SUGGESTED REPLY WORKFLOW */}
            {activeTab === 'reply' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> AI Suggested Reply
                    </span>
                    <button
                      onClick={() => copyReplyText(editableReplyText)}
                      className="text-slate-400 hover:text-white text-[11px] flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedReply ? 'Copied!' : 'Copy'}
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={editableReplyText}
                    onChange={(e) => setEditableReplyText(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed resize-y"
                    placeholder="Suggested AI reply..."
                  />

                  {/* 4 PROFESSIONAL QUICK ACTIONS */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {onInsertReply && (
                      <button
                        type="button"
                        onClick={() => onInsertReply(editableReplyText)}
                        className="py-2 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileEdit className="w-3.5 h-3.5 text-indigo-300" /> Insert Draft
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSendReplyDirectly}
                      disabled={sendingReply || !editableReplyText.trim()}
                      className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-md shadow-indigo-600/20"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sendingReply ? 'Sending...' : 'Send After Review'}
                    </button>

                    <button
                      type="button"
                      onClick={handleApplySelected}
                      disabled={applying || selectedSuggestionIds.length === 0}
                      className="col-span-2 py-2 px-3 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Apply Lead Updates ({selectedSuggestionIds.length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
