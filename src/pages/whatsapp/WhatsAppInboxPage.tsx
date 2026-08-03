import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { whatsappInboxApi, type WhatsAppConversation, type WhatsAppMessage } from '../../lib/whatsappInboxApi'
import { teamApi, type TeamMemberItem } from '../../lib/teamApi'
import { formatPhoneNumber } from '../../lib/whatsapp'
import {
  MessageSquare,
  Search,
  UserCheck,
  CheckCircle2,
  Send,
  ArrowLeft,
  User,
  AlertCircle,
  Check,
  CheckCheck,
  RefreshCw
} from 'lucide-react'

export const WhatsAppInboxPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const { user } = useAuth()

  const [conversations, setConversations] = useState<WhatsAppConversation[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([])

  const [filterStatus, setFilterStatus] = useState<'all' | 'needs_response' | 'unread' | 'assigned_to_me' | 'unassigned' | 'open' | 'resolved'>('needs_response')
  const [searchQuery, setSearchQuery] = useState('')

  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Fetch Team Members
  useEffect(() => {
    let isMounted = true
    if (currentWorkspace) {
      teamApi.getTeamMembers(currentWorkspace.id).then((m) => {
        if (isMounted) setTeamMembers(m)
      }).catch(console.error)
    }
    return () => { isMounted = false }
  }, [currentWorkspace])

  // Manual Refresh Handler
  const handleRefresh = async () => {
    if (!currentWorkspace) return
    setLoadingConvs(true)
    try {
      const data = await whatsappInboxApi.getConversations(currentWorkspace.id, {
        status: filterStatus as never,
        search: searchQuery,
        currentUserId: user?.id,
      })
      setConversations(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingConvs(false)
    }
  }

  // Fetch Conversations Effect
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(async () => {
      if (!currentWorkspace) return
      try {
        const data = await whatsappInboxApi.getConversations(currentWorkspace.id, {
          status: filterStatus as never,
          search: searchQuery,
          currentUserId: user?.id,
        })
        if (isMounted) {
          setConversations(data)
          if (data.length > 0 && !selectedConvId) {
            setSelectedConvId(data[0].id)
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (isMounted) setLoadingConvs(false)
      }
    }, 0)
    return () => { isMounted = false; clearTimeout(timer) }
  }, [currentWorkspace, filterStatus, searchQuery, user?.id, selectedConvId])

  // Fetch Messages Effect
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(async () => {
      if (!selectedConvId) {
        if (isMounted) setMessages([])
        return
      }

      if (isMounted) setLoadingMsgs(true)
      try {
        const data = await whatsappInboxApi.getMessages(selectedConvId)
        if (isMounted) {
          setMessages(data)
          whatsappInboxApi.markRead(selectedConvId)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (isMounted) setLoadingMsgs(false)
      }
    }, 0)

    return () => { isMounted = false; clearTimeout(timer) }
  }, [selectedConvId])

  // Scroll to bottom when messages load/change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime Subscription
  useEffect(() => {
    if (!currentWorkspace || !isSupabaseConfigured || !supabase) return

    const reloadData = () => {
      whatsappInboxApi.getConversations(currentWorkspace.id, {
        status: filterStatus as never,
        search: searchQuery,
        currentUserId: user?.id,
      }).then(setConversations).catch(console.error)
    }

    const channel = supabase
      .channel(`whatsapp_inbox_${currentWorkspace.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        () => {
          reloadData()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        (payload) => {
          const newMsg = payload.new as WhatsAppMessage
          if (newMsg && newMsg.conversation_id === selectedConvId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) {
                return prev.map((m) => (m.id === newMsg.id ? newMsg : m))
              }
              return [...prev, newMsg]
            })
          }
          reloadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentWorkspace, selectedConvId, filterStatus, searchQuery, user?.id])

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace || !selectedConvId || !replyText.trim()) return

    setSendingReply(true)
    setErrorMsg(null)
    const textToSend = replyText.trim()
    setReplyText('')

    try {
      await whatsappInboxApi.sendReplyMessage({
        workspace_id: currentWorkspace.id,
        conversation_id: selectedConvId,
        text_body: textToSend,
      })

      const updatedMsgs = await whatsappInboxApi.getMessages(selectedConvId)
      setMessages(updatedMsgs)
      await handleRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send WhatsApp reply'
      setErrorMsg(msg)
      setReplyText(textToSend)
    } finally {
      setSendingReply(false)
    }
  }

  const handleStatusToggle = async (status: 'open' | 'waiting' | 'resolved') => {
    if (!selectedConvId) return
    await whatsappInboxApi.updateConversationStatus(selectedConvId, status)
    await handleRefresh()
  }

  const handleAssignAgent = async (agentId: string | null) => {
    if (!selectedConvId) return
    await whatsappInboxApi.assignConversation(selectedConvId, agentId)
    await handleRefresh()
  }

  const selectedConv = conversations.find((c) => c.id === selectedConvId)

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="font-heading font-bold text-2xl text-navy-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-600" />
            WhatsApp Real-Time Team Inbox
          </h1>
          <p className="text-xs text-content-secondary mt-0.5">
            Manage live incoming WhatsApp customer conversations, lead matching, and official Cloud API replies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/whatsapp/review">
            <Button variant="outline" size="sm" icon={<UserCheck className="w-4 h-4 text-brand-blue" />}>
              Unknown Contact Reviews
            </Button>
          </Link>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={handleRefresh}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Inbox Container */}
      <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[720px] max-h-[82dvh]">
        {/* COLUMN 1: CONVERSATION LIST (4 cols) */}
        <div className={`md:col-span-4 border-r border-surface-border flex flex-col bg-slate-50/50 ${selectedConvId ? 'hidden md:flex' : 'flex'}`}>
          {/* Filters & Search */}
          <div className="p-3 border-b border-surface-border space-y-2 bg-white">
            <Input
              placeholder="Search contact or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />

            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
              {[
                { key: 'needs_response', label: 'Needs Response' },
                { key: 'all', label: 'All' },
                { key: 'unread', label: 'Unread' },
                { key: 'assigned_to_me', label: 'My Chats' },
                { key: 'unassigned', label: 'Unassigned' },
                { key: 'resolved', label: 'Resolved' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterStatus(tab.key as never)}
                  className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap font-medium ${
                    filterStatus === tab.key
                      ? 'bg-brand-blue text-white font-bold'
                      : 'bg-slate-100 text-content-secondary hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-surface-border/60">
            {loadingConvs ? (
              <div className="py-12 text-center text-xs text-content-secondary">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="py-12 text-center text-xs text-content-muted space-y-2 px-4">
                <MessageSquare className="w-8 h-8 mx-auto text-content-muted" />
                <p className="font-bold text-navy-900">No Conversations Found</p>
                <p className="text-[11px]">Incoming WhatsApp messages will automatically populate this real-time team inbox.</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.id === selectedConvId
                const formattedPhone = formatPhoneNumber(conv.contact_phone)
                const assignedMember = teamMembers.find((m) => m.userId === conv.assigned_to)

                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left p-3.5 transition-all flex items-start gap-3 relative ${
                      isSelected
                        ? 'bg-blue-50/80 border-l-4 border-l-brand-blue'
                        : 'hover:bg-slate-100/70 bg-white'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                      {conv.contact_name ? conv.contact_name.charAt(0).toUpperCase() : 'W'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-navy-900 truncate">
                          {conv.contact_name || formattedPhone}
                        </span>
                        <span className="text-[10px] text-content-muted shrink-0">
                          {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <p className="text-[11px] text-content-secondary truncate mt-0.5">
                        {conv.last_message_preview || 'No messages yet'}
                      </p>

                      <div className="flex items-center justify-between mt-2 text-[10px] text-content-muted">
                        <div className="flex items-center gap-1.5">
                          {conv.lead ? (
                            <Badge variant="blue" size="sm">
                              LEAD: {conv.lead.status.toUpperCase()}
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">
                              REVIEW REQUIRED
                            </Badge>
                          )}
                          {assignedMember && (
                            <span className="flex items-center gap-0.5 text-navy-800 font-medium">
                              <User className="w-3 h-3 text-content-muted" /> {assignedMember.fullName.split(' ')[0]}
                            </span>
                          )}
                        </div>

                        {conv.unread_count > 0 && (
                          <span className="px-1.5 py-0.5 bg-brand-blue text-white rounded-full font-bold text-[10px]">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: CONVERSATION THREAD (8 cols) */}
        <div className={`md:col-span-8 flex flex-col bg-white ${!selectedConvId ? 'hidden md:flex' : 'flex'}`}>
          {selectedConv ? (
            <>
              {/* Thread Header */}
              <div className="p-3.5 border-b border-surface-border flex items-center justify-between gap-3 bg-slate-50/80">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => setSelectedConvId(null)} className="md:hidden p-1 text-navy-900 hover:bg-slate-200 rounded-lg">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {selectedConv.contact_name ? selectedConv.contact_name.charAt(0).toUpperCase() : 'W'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-navy-900 truncate">
                        {selectedConv.contact_name || formatPhoneNumber(selectedConv.contact_phone)}
                      </span>
                      <Badge variant={selectedConv.status === 'open' ? 'success' : selectedConv.status === 'waiting' ? 'blue' : 'neutral'} size="sm">
                        {selectedConv.status.toUpperCase()}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-content-secondary font-mono block">
                      {formatPhoneNumber(selectedConv.contact_phone)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...teamMembers.map((m) => ({ value: m.userId, label: m.fullName })),
                    ]}
                    value={selectedConv.assigned_to || ''}
                    onChange={(e) => handleAssignAgent(e.target.value || null)}
                    className="text-xs py-1"
                  />

                  {selectedConv.status === 'resolved' ? (
                    <Button variant="outline" size="sm" onClick={() => handleStatusToggle('open')}>
                      Reopen Chat
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />} onClick={() => handleStatusToggle('resolved')}>
                      Resolve
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages Thread Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                {loadingMsgs ? (
                  <div className="py-12 text-center text-xs text-content-secondary">Loading message thread...</div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-content-muted">No messages in this conversation.</div>
                ) : (
                  messages.map((msg) => {
                    const isOutgoing = msg.direction === 'outgoing'
                    return (
                      <div key={msg.id} className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] p-3 rounded-2xl text-xs space-y-1 shadow-sm ${
                            isOutgoing
                              ? 'bg-emerald-700 text-white rounded-br-none'
                              : 'bg-white border border-surface-border text-navy-900 rounded-bl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {msg.text_body || msg.media_caption || `[${msg.message_type.toUpperCase()}]`}
                          </p>

                          <div className={`flex items-center justify-end gap-1 text-[10px] ${isOutgoing ? 'text-emerald-200' : 'text-content-muted'}`}>
                            <span>
                              {new Date(msg.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isOutgoing && (
                              <span>
                                {msg.status === 'read' ? (
                                  <CheckCheck className="w-3 h-3 text-sky-300" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3 h-3 text-emerald-200" />
                                ) : msg.status === 'failed' ? (
                                  <AlertCircle className="w-3 h-3 text-red-300" />
                                ) : (
                                  <Check className="w-3 h-3 text-emerald-300" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Error Banner */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border-t border-red-200 text-xs text-status-critical flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  <button onClick={() => setErrorMsg(null)} className="text-red-700 hover:text-red-900 font-bold">×</button>
                </div>
              )}

              {/* Message Composer */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-surface-border bg-white flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type an official WhatsApp Cloud API reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={sendingReply || selectedConv.status === 'resolved'}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-surface-border text-xs text-navy-900 placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={sendingReply}
                  disabled={!replyText.trim() || selectedConv.status === 'resolved'}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  icon={<Send className="w-4 h-4" />}
                >
                  Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-content-muted space-y-3">
              <MessageSquare className="w-12 h-12 text-content-muted" />
              <div>
                <h3 className="font-bold text-navy-900 text-sm">Select a Conversation</h3>
                <p className="text-xs text-content-secondary mt-1">
                  Choose a contact from the inbox list to view live message history and reply via Meta Cloud API.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
