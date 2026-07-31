import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../hooks/useWorkspace'
import { fetchWorkspaceAttentionItems, type AttentionItem, getUrgencyBadgeVariant } from '../../lib/attentionEngine'
import { Badge } from '../ui/Badge'
import { Bell, ArrowRight, CheckCircle2 } from 'lucide-react'

export const NotificationCenter: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<AttentionItem[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadNotifications = useCallback(async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const data = await fetchWorkspaceAttentionItems(currentWorkspace.id)
      setItems(data)
    } catch (err) {
      console.error('Failed to load notification alerts:', err)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadNotifications()
    })

    const handleUpdate = () => loadNotifications()
    window.addEventListener('noverlyn:lead_created', handleUpdate)
    return () => window.removeEventListener('noverlyn:lead_created', handleUpdate)
  }, [loadNotifications])

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

  const criticalCount = items.filter((i) => i.urgency_level === 'CRITICAL').length
  const totalCount = items.length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded-lg text-content-secondary hover:text-navy-900 hover:bg-slate-100 relative transition-colors"
        title="Notifications & Operational Alerts"
      >
        <Bell className="w-4 h-4" />
        {totalCount > 0 && (
          <span
            className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
              criticalCount > 0 ? 'bg-status-critical animate-pulse ring-2 ring-white' : 'bg-brand-blue ring-2 ring-white'
            }`}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-surface-border rounded-xl shadow-lg z-50 overflow-hidden divide-y divide-surface-border">
          <div className="p-3 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-xs text-navy-900">Operational Attention Alerts</span>
              {totalCount > 0 && (
                <Badge variant={criticalCount > 0 ? 'critical' : 'blue'} size="sm">
                  {totalCount} ACTIVE
                </Badge>
              )}
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/work-queue')
              }}
              className="text-[11px] font-semibold text-brand-blue hover:underline"
            >
              View Work Queue
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-surface-border">
            {loading ? (
              <div className="p-6 text-center text-xs text-content-muted">Loading active alerts...</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-xs text-content-muted flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <span>You're all caught up! No active attention alerts for your workspace.</span>
              </div>
            ) : (
              items.slice(0, 6).map((item) => (
                <div
                  key={item.lead_id}
                  onClick={() => {
                    setIsOpen(false)
                    navigate(`/leads/${item.lead_id}`)
                  }}
                  className="p-3 hover:bg-slate-50 cursor-pointer transition-colors space-y-1 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-navy-900 group-hover:text-brand-blue transition-colors">
                        {item.lead_name}
                      </span>
                      <Badge variant={getUrgencyBadgeVariant(item.urgency_level)} size="sm">
                        {item.urgency_level}
                      </Badge>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-content-muted group-hover:text-brand-blue transition-colors" />
                  </div>
                  <p className="text-[11px] text-content-primary font-medium">{item.primary_issue_detail}</p>
                </div>
              ))
            )}
          </div>

          {items.length > 6 && (
            <div className="p-2 text-center bg-slate-50">
              <button
                onClick={() => {
                  setIsOpen(false)
                  navigate('/work-queue')
                }}
                className="text-[11px] text-content-secondary hover:text-navy-900 font-semibold"
              >
                + {items.length - 6} more attention items in Work Queue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
