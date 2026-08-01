import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { notificationsApi, type AppNotification } from '../../lib/notificationsApi'
import { Badge } from '../ui/Badge'
import {
  Bell,
  CheckCircle2,
  CheckCheck,
  UserCheck,
  Calendar,
  AlertTriangle,
  Trophy,
  XCircle,
  FileText,
  Sparkles,
  ExternalLink
} from 'lucide-react'

export const NotificationCenter: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadNotifications = useCallback(async () => {
    if (!currentWorkspace || !user) return
    setLoading(true)
    try {
      // Trigger background due/overdue check
      await notificationsApi.generateReminders(currentWorkspace.id)
      const data = await notificationsApi.getNotifications(currentWorkspace.id, 50)
      setNotifications(data)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace, user])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadNotifications()
    })

    // Supabase Realtime Listener
    if (supabase && currentWorkspace && user) {
      const channel = supabase
        .channel(`user-notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.new && (payload.new as AppNotification).workspace_id === currentWorkspace.id) {
              setNotifications((prev) => [payload.new as AppNotification, ...prev])
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [currentWorkspace, user, loadNotifications])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
    await notificationsApi.markAsRead(id)
  }

  const handleMarkAllRead = async () => {
    if (!currentWorkspace || !user) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await notificationsApi.markAllAsRead(currentWorkspace.id, user.id)
  }

  const handleNotificationClick = (item: AppNotification) => {
    if (!item.is_read) {
      handleMarkAsRead(item.id)
    }
    setIsOpen(false)

    if (item.entity_type === 'lead' && item.entity_id) {
      navigate(`/leads/${item.entity_id}`)
    } else if (item.type === 'public_form_lead') {
      navigate('/leads/inbox')
    } else if (item.type === 'invitation_accepted') {
      navigate('/team')
    } else if (item.type === 'daily_digest') {
      navigate('/work-queue')
    } else {
      navigate('/work-queue')
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'public_form_lead':
        return <FileText className="w-4 h-4 text-brand-blue" />
      case 'lead_assigned':
        return <UserCheck className="w-4 h-4 text-indigo-600" />
      case 'followup_due':
        return <Calendar className="w-4 h-4 text-amber-600" />
      case 'followup_overdue':
        return <AlertTriangle className="w-4 h-4 text-status-critical" />
      case 'lead_won':
        return <Trophy className="w-4 h-4 text-emerald-600" />
      case 'lead_lost':
        return <XCircle className="w-4 h-4 text-slate-400" />
      case 'daily_digest':
        return <Sparkles className="w-4 h-4 text-purple-600" />
      default:
        return <Bell className="w-4 h-4 text-brand-blue" />
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded-xl text-content-secondary hover:text-navy-900 hover:bg-slate-100 relative transition-colors"
        title="Notifications & Operational Reminders"
        aria-expanded={isOpen}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-status-critical text-[9px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-surface-border/90 rounded-2xl shadow-xl z-[100] overflow-hidden divide-y divide-surface-border/60 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="p-3.5 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-xs text-navy-900">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="blue" size="sm">
                  {unreadCount} UNREAD
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-semibold text-brand-blue hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-88 overflow-y-auto divide-y divide-surface-border/50">
            {loading && notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-content-muted">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-content-muted flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <span>You're all caught up! No notifications in your inbox.</span>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors space-y-1 group relative ${
                    !item.is_read ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-lg bg-slate-100 shrink-0">
                        {getNotificationIcon(item.type)}
                      </div>
                      <span className={`font-bold text-xs truncate ${!item.is_read ? 'text-navy-900' : 'text-slate-700'}`}>
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-content-muted">
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {!item.is_read && (
                        <button
                          onClick={(e) => handleMarkAsRead(item.id, e)}
                          title="Mark read"
                          className="text-slate-300 hover:text-brand-blue transition-colors p-0.5"
                        >
                          <div className="w-2 h-2 rounded-full bg-brand-blue" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-content-secondary line-clamp-2 pl-8 leading-relaxed">
                    {item.message}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 text-center bg-slate-50 flex items-center justify-between px-4 text-xs font-semibold text-content-secondary">
            <span>Noverlyn Real-Time Inbox</span>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/work-queue')
              }}
              className="text-brand-blue hover:underline flex items-center gap-1"
            >
              Work Queue <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
