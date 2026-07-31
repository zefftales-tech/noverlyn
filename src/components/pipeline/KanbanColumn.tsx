import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanCard } from './KanbanCard'
import type { AttentionItem } from '../../lib/attentionEngine'
import type { Database } from '../../types/database.types'

type Lead = Database['public']['Tables']['leads']['Row']

export interface KanbanColumnProps {
  id: string
  title: string
  leads: Lead[]
  attentionMap: Record<string, AttentionItem>
  membersMap: Record<string, string>
  currency: string
  onLeadClick: (lead: Lead) => void
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  id,
  title,
  leads,
  attentionMap,
  membersMap,
  currency,
  onLeadClick,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id })

  const totalValue = leads.reduce((acc, l) => acc + (l.estimated_value || 0), 0)
  const leadIds = leads.map((l) => l.id)

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 bg-slate-50/80 border rounded-2xl flex flex-col max-h-[calc(100vh-220px)] transition-all duration-150 ${
        isOver ? 'border-brand-blue ring-2 ring-blue-100 bg-blue-50/50 shadow-md' : 'border-surface-border'
      }`}
    >
      {/* Column Header */}
      <div className="p-3.5 border-b border-surface-border bg-white rounded-t-2xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-bold text-xs uppercase text-navy-900 tracking-wider">{title}</h3>
            <span className="bg-slate-100 text-navy-900 text-[11px] font-bold px-2 py-0.5 rounded-full border border-surface-border">
              {leads.length}
            </span>
          </div>
          <span className="text-[11px] text-content-muted block mt-1 font-semibold">
            {currency} {totalValue.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Column Cards Container */}
      <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px] no-scrollbar">
        {leads.length === 0 ? (
          <div className="h-28 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-content-muted font-medium bg-white/40">
            No leads in this stage
          </div>
        ) : (
          <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
            {leads.map((lead) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                attentionItem={attentionMap[lead.id]}
                agentName={lead.assigned_to ? membersMap[lead.assigned_to] : undefined}
                currency={currency}
                onCardClick={() => onLeadClick(lead)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  )
}
