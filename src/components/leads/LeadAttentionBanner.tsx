import React from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { AttentionItem } from '../../lib/attentionEngine'
import { getUrgencyBadgeVariant } from '../../lib/attentionEngine'
import { AlertTriangle, CheckCircle2, PhoneCall, Calendar } from 'lucide-react'

export interface LeadAttentionBannerProps {
  attentionItem: AttentionItem | null
  onLogContact: () => void
  onScheduleFollowUp: () => void
  onCompleteFollowUp: () => void
}

export const LeadAttentionBanner: React.FC<LeadAttentionBannerProps> = ({
  attentionItem,
  onLogContact,
  onScheduleFollowUp,
  onCompleteFollowUp,
}) => {
  if (!attentionItem) return null

  const isCritical = attentionItem.urgency_level === 'CRITICAL'
  const isHigh = attentionItem.urgency_level === 'HIGH'

  return (
    <div
      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
        isCritical
          ? 'bg-status-critical-bg border-red-200 shadow-2xs'
          : isHigh
          ? 'bg-status-warning-bg border-amber-200 shadow-2xs'
          : 'bg-brand-blue-light border-blue-200 shadow-2xs'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2.5 rounded-lg shrink-0 mt-0.5 ${
            isCritical
              ? 'bg-status-critical text-white'
              : isHigh
              ? 'bg-status-warning text-white'
              : 'bg-brand-blue text-white'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getUrgencyBadgeVariant(attentionItem.urgency_level)} className="font-bold">
              {attentionItem.urgency_level} ATTENTION
            </Badge>
            <span className="font-heading font-bold text-sm text-navy-900">
              {attentionItem.primary_issue_label}
            </span>
          </div>
          <p className="text-xs text-content-primary">
            {attentionItem.primary_issue_detail}
          </p>

          {/* Secondary Issues Badges */}
          {attentionItem.secondary_issues && attentionItem.secondary_issues.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 flex-wrap text-[11px]">
              <span className="text-content-muted font-medium">Also:</span>
              {attentionItem.secondary_issues.map((sec, idx) => (
                <span key={idx} className="bg-white/80 border border-slate-200 px-1.5 py-0.5 rounded font-semibold text-navy-900">
                  {sec.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {attentionItem.primary_issue === 'overdue_follow_up' || attentionItem.primary_issue === 'due_today' ? (
          <Button
            variant={isCritical ? 'danger' : 'primary'}
            size="sm"
            icon={<CheckCircle2 className="w-4 h-4" />}
            onClick={onCompleteFollowUp}
          >
            Complete Action
          </Button>
        ) : attentionItem.primary_issue === 'new_lead_waiting' ? (
          <Button variant="primary" size="sm" icon={<PhoneCall className="w-4 h-4" />} onClick={onLogContact}>
            Log Contact
          </Button>
        ) : (
          <Button variant="primary" size="sm" icon={<Calendar className="w-4 h-4" />} onClick={onScheduleFollowUp}>
            Schedule Action
          </Button>
        )}
      </div>
    </div>
  )
}
