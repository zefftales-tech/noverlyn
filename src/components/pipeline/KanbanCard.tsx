import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '../ui/Badge'
import type { AttentionItem } from '../../lib/attentionEngine'
import { getUrgencyBadgeVariant } from '../../lib/attentionEngine'
import type { Database } from '../../types/database.types'
import { UserCheck, AlertTriangle, GripVertical } from 'lucide-react'

type Lead = Database['public']['Tables']['leads']['Row']

export interface KanbanCardProps {
  lead: Lead
  attentionItem?: AttentionItem
  agentName?: string
  currency: string
  onCardClick: () => void
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  lead,
  attentionItem,
  agentName,
  currency,
  onCardClick,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isCritical = attentionItem?.urgency_level === 'CRITICAL'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-surface-card border rounded-xl p-3.5 space-y-2.5 shadow-2xs hover:shadow-md transition-all group relative cursor-pointer ${
        isCritical
          ? 'border-red-300 bg-red-50/30'
          : attentionItem
          ? 'border-amber-200'
          : 'border-surface-border hover:border-brand-blue'
      }`}
      onClick={onCardClick}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={lead.priority === 'hot' ? 'critical' : lead.priority === 'warm' ? 'warning' : 'neutral'}
            size="sm"
          >
            {lead.priority.toUpperCase()}
          </Badge>
          {attentionItem && (
            <Badge variant={getUrgencyBadgeVariant(attentionItem.urgency_level)} size="sm">
              {attentionItem.urgency_level}
            </Badge>
          )}
        </div>

        {/* Drag Handle Icon */}
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded text-content-muted hover:text-navy-900 cursor-grab active:cursor-grabbing hover:bg-slate-100"
          title="Drag to change stage"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      </div>

      {/* Lead Name */}
      <div>
        <h4 className="font-heading font-bold text-sm text-navy-900 group-hover:text-brand-blue transition-colors">
          {lead.full_name}
        </h4>
        {attentionItem && (
          <p className="text-[11px] font-semibold text-status-critical mt-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{attentionItem.primary_issue_label}</span>
          </p>
        )}
      </div>

      {/* Details Row */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-border text-content-secondary">
        <span className="font-bold text-navy-900">
          {lead.estimated_value ? `${currency} ${lead.estimated_value.toLocaleString()}` : '—'}
        </span>
        <span className="text-[11px] text-content-muted flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          <strong className="text-navy-900">{agentName || 'Unassigned'}</strong>
        </span>
      </div>
    </div>
  )
}
