import React from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import type { TeamMemberItem } from '../../lib/teamApi'
import { X, ShieldCheck } from 'lucide-react'

export interface MemberDetailDrawerProps {
  isOpen: boolean
  onClose: () => void
  member: TeamMemberItem | null
}

export const MemberDetailDrawer: React.FC<MemberDetailDrawerProps> = ({ isOpen, onClose, member }) => {
  if (!isOpen || !member) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col overflow-y-auto divide-y divide-surface-border">
        {/* Drawer Header */}
        <div className="p-4 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={member.fullName} url={member.avatarUrl} size="md" />
            <div>
              <h2 className="font-heading font-bold text-base text-navy-900">{member.fullName}</h2>
              <span className="text-xs text-content-secondary uppercase font-semibold">{member.role}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-muted hover:text-navy-900 hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Workload Content */}
        <div className="p-6 space-y-6 flex-1">
          <div>
            <h3 className="text-xs uppercase font-bold text-content-muted tracking-wider">Account Overview</h3>
            <div className="mt-2 space-y-2 text-xs">
              <div className="flex justify-between border-b border-surface-border pb-2">
                <span className="text-content-secondary">Status:</span>
                <Badge variant={member.status === 'active' ? 'success' : 'critical'} size="sm">
                  {member.status.toUpperCase()}
                </Badge>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-2">
                <span className="text-content-secondary">Role:</span>
                <span className="font-bold text-navy-900 uppercase">{member.role}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-2">
                <span className="text-content-secondary">Joined Date:</span>
                <span className="font-semibold text-navy-900">
                  {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase font-bold text-content-muted tracking-wider">Operational Workload</h3>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 bg-slate-50 border border-surface-border rounded-lg text-center">
                <span className="text-xs font-semibold text-content-secondary block">Active Leads</span>
                <span className="text-2xl font-bold font-heading text-navy-900 block mt-1">{member.activeLeadsCount}</span>
              </div>

              <div className="p-3 bg-slate-50 border border-surface-border rounded-lg text-center">
                <span className="text-xs font-semibold text-content-secondary block">Overdue Tasks</span>
                <span className={`text-2xl font-bold font-heading block mt-1 ${member.overdueCount > 0 ? 'text-status-critical' : 'text-navy-900'}`}>
                  {member.overdueCount}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-surface-border rounded-lg text-center">
                <span className="text-xs font-semibold text-content-secondary block">Due Today</span>
                <span className="text-2xl font-bold font-heading text-brand-blue block mt-1">{member.dueTodayCount}</span>
              </div>

              <div className="p-3 bg-slate-50 border border-surface-border rounded-lg text-center">
                <span className="text-xs font-semibold text-content-secondary block">Won Deals</span>
                <span className="text-2xl font-bold font-heading text-emerald-600 block mt-1">{member.wonDealsCount}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg text-xs text-navy-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-4 h-4 text-brand-blue" />
              <span>Operational Workload Integrity</span>
            </div>
            <p className="text-content-secondary text-[11px]">
              Workload metrics are calculated deterministically based on active leads and scheduled follow-ups assigned to this member.
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-slate-50 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Drawer
          </Button>
        </div>
      </div>
    </div>
  )
}
