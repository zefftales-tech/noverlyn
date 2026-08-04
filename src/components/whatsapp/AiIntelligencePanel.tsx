import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Send,
  RefreshCw,
  Flame,
  ThermometerSun,
  Snowflake,
  HelpCircle,
  Target,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  Layers,
  MessageSquare,
} from 'lucide-react'
import {
  aiIntelligenceApi,
  type AiConversationAnalysis,
  type AiLeadSuggestion,
} from '../../lib/aiIntelligenceApi'

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
  onInsertReply,
  onEvidenceClick,
  onCloseMobileDrawer,
}) => {
  const [analysis, setAnalysis] = useState<AiConversationAnalysis | null>(null)
  const [suggestions, setSuggestions] = useState<AiLeadSuggestion[]>([])
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [createFollowUp, setCreateFollowUp] = useState(true)
  const [activeTab, setActiveTab] = useState<'insights' | 'suggestions' | 'reply'>('insights')
  const [copiedReply, setCopiedReply] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
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
          const sugs = await aiIntelligenceApi.getSuggestions(latest.id)
          if (isCancelled) return
          setSuggestions(sugs)
          setSelectedSuggestionIds(sugs.filter((s) => s.status === 'pending').map((s) => s.id))
        } else {
          setAnalysis(null)
          setSuggestions([])
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
      setSuggestions(result.suggestions)
      setSelectedSuggestionIds(result.suggestions.filter((s) => s.status === 'pending').map((s) => s.id))
    } catch (err) {
      console.error('Analysis failed:', err)
      alert('Analysis failed. Please try again.')
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
      alert('Approved suggestions applied successfully!')
      await handleRunAnalysis(true)
    } catch (err) {
      console.error('Apply failed:', err)
      alert('Failed to apply suggestions.')
    } finally {
      setApplying(false)
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
            <p className="text-xs text-slate-400">Multi-Industry Conversation Insights</p>
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
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 lg:hidden"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/50 px-3 pt-2">
        <button
          onClick={() => setActiveTab('insights')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'insights'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Insights</span>
        </button>

        <button
          onClick={() => setActiveTab('suggestions')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'suggestions'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Review ({suggestions.filter((s) => s.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reply')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'reply'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Suggested Reply</span>
        </button>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!analysis && !loading && (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">No AI Analysis Generated Yet</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Analyze recent WhatsApp messages to extract customer intent, lead score, missing information, and suggested replies.
            </p>
            <button
              onClick={() => handleRunAnalysis(false)}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" /> Analyze Conversation
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Analyzing conversation context & extracting structured insights...</p>
          </div>
        )}

        {analysis && !loading && (
          <>
            {/* INSIGHTS TAB */}
            {activeTab === 'insights' && (
              <div className="space-y-4">
                {/* 1. Lead Score & Temperature */}
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleSection('score')}
                  >
                    <div className="flex items-center space-x-2">
                      <Target className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-white">Qualification & Urgency</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {renderTemperatureBadge(analysis.lead_temperature)}
                      {expandedSections.score ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {expandedSections.score && (
                    <div className="pt-2 border-t border-slate-700/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Lead Qualification Score:</span>
                        <span className="text-sm font-bold text-white">
                          {analysis.lead_score ?? 50}/100
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/60 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            (analysis.lead_score ?? 0) >= 75
                              ? 'bg-rose-500'
                              : (analysis.lead_score ?? 0) >= 40
                              ? 'bg-amber-500'
                              : 'bg-sky-500'
                          }`}
                          style={{ width: `${analysis.lead_score ?? 50}%` }}
                        />
                      </div>
                      {analysis.urgency && (
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                          <span>Urgency Level:</span>
                          <span className="font-semibold capitalize text-indigo-300">
                            {analysis.urgency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Customer Intent & Requirement */}
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleSection('intent')}
                  >
                    <span className="text-xs font-semibold text-white flex items-center">
                      <HelpCircle className="w-4 h-4 text-emerald-400 mr-1.5" /> Customer Intent
                    </span>
                    {expandedSections.intent ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>

                  {expandedSections.intent && (
                    <div className="pt-2 border-t border-slate-700/40 space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Primary Intent:</span>
                        <p className="text-slate-200 font-medium">
                          {analysis.customer_intent || 'General inquiry'}
                        </p>
                      </div>
                      {analysis.requirement_summary && (
                        <div>
                          <span className="text-slate-400 block mb-0.5">Requirement Summary:</span>
                          <p className="text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800">
                            {analysis.requirement_summary}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Next Best Action */}
                {analysis.recommended_next_action && (
                  <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
                    <div className="flex items-center space-x-2">
                      <ArrowRight className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-200">
                        Recommended Next Best Action
                      </span>
                    </div>
                    <p className="text-xs text-white font-medium">
                      {analysis.recommended_next_action}
                    </p>
                    {analysis.recommended_action_reason && (
                      <p className="text-xs text-indigo-300/80 italic">
                        "{analysis.recommended_action_reason}"
                      </p>
                    )}
                  </div>
                )}

                {/* 4. Missing Information */}
                {analysis.missing_information && analysis.missing_information.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-2">
                    <div className="flex items-center space-x-1.5 text-amber-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs font-semibold">Missing Information</span>
                    </div>
                    <ul className="text-xs text-amber-200/90 space-y-1 pl-4 list-disc">
                      {analysis.missing_information.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 5. Buying Signals & Objections */}
                <div className="grid grid-cols-1 gap-2">
                  {analysis.buying_signals && analysis.buying_signals.length > 0 && (
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs">
                      <span className="font-semibold text-emerald-400 block mb-1">
                        Buying Signals Detected:
                      </span>
                      <ul className="list-disc pl-4 text-emerald-200 space-y-0.5">
                        {analysis.buying_signals.map((sig, i) => (
                          <li key={i}>{sig}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.objections && analysis.objections.length > 0 && (
                    <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20 text-xs">
                      <span className="font-semibold text-rose-400 block mb-1">
                        Active Objections / Risks:
                      </span>
                      <ul className="list-disc pl-4 text-rose-200 space-y-0.5">
                        {analysis.objections.map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUGGESTIONS TAB */}
            {activeTab === 'suggestions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Select suggestions to approve & apply to Lead:
                  </span>
                </div>

                <div className="space-y-2">
                  {suggestions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">
                      No pending suggestions for this analysis.
                    </p>
                  ) : (
                    suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                          selectedSuggestionIds.includes(sug.id)
                            ? 'bg-indigo-950/30 border-indigo-500/50'
                            : 'bg-slate-800/40 border-slate-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <label className="flex items-center space-x-2 cursor-pointer font-semibold text-white">
                            <input
                              type="checkbox"
                              checked={selectedSuggestionIds.includes(sug.id)}
                              onChange={() => toggleSuggestionSelection(sug.id)}
                              className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                            />
                            <span className="capitalize">{sug.target_field || sug.suggestion_type}</span>
                          </label>

                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                            {Math.round(sug.confidence * 100)}% Confidence
                          </span>
                        </div>

                        <div className="bg-slate-900/60 p-2 rounded border border-slate-800 space-y-1">
                          <div className="text-slate-300">
                            <span className="text-slate-400">Suggested Value: </span>
                            <span className="font-semibold text-indigo-300">
                              {typeof sug.suggested_value === 'object'
                                ? JSON.stringify(sug.suggested_value)
                                : String(sug.suggested_value)}
                            </span>
                          </div>

                          {sug.evidence_text && (
                            <p className="text-[11px] text-slate-400 italic">"{sug.evidence_text}"</p>
                          )}
                        </div>

                        {sug.evidence_message_ids && sug.evidence_message_ids.length > 0 && (
                          <div className="flex items-center space-x-1 text-[10px] text-indigo-400">
                            <span>Evidence Message ID:</span>
                            <button
                              onClick={() => onEvidenceClick?.(sug.evidence_message_ids[0])}
                              className="underline hover:text-indigo-300"
                            >
                              {sug.evidence_message_ids[0].slice(0, 15)}...
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {suggestions.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createFollowUp}
                        onChange={(e) => setCreateFollowUp(e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                      />
                      <span>Create recommended follow-up task on approval</span>
                    </label>

                    <button
                      onClick={handleApplySelected}
                      disabled={applying || selectedSuggestionIds.length === 0}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {applying ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>Approve Selected ({selectedSuggestionIds.length})</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SUGGESTED REPLY TAB */}
            {activeTab === 'reply' && (
              <div className="space-y-4">
                {analysis.suggested_reply ? (
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-400 flex items-center">
                        <Sparkles className="w-4 h-4 mr-1.5" /> AI Drafted Reply
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Human-in-the-Loop Review
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 bg-slate-900/80 p-3 rounded-lg border border-slate-800 leading-relaxed font-sans">
                      {analysis.suggested_reply}
                    </p>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={() => copyReplyText(analysis.suggested_reply!)}
                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedReply ? 'Copied!' : 'Copy Reply'}</span>
                      </button>

                      {onInsertReply && (
                        <button
                          onClick={() => onInsertReply(analysis.suggested_reply!)}
                          className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors shadow-lg shadow-indigo-600/20"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Insert into Chat</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No suggested reply available for this conversation.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
