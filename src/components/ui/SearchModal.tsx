import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { useWorkspace } from '../../hooks/useWorkspace'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database.types'
import { Search, User, Phone, ArrowRight, Loader2 } from 'lucide-react'
import { Badge } from './Badge'

type Lead = Database['public']['Tables']['leads']['Row']

export interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => {
        setQuery('')
        setResults([])
      })
    }
  }, [isOpen])

  useEffect(() => {
    const handleSearch = async () => {
      if (!currentWorkspace || !supabase || !query.trim()) {
        setResults([])
        return
      }

      setLoading(true)
      const q = `%${query.trim()}%`

      try {
        const { data } = await supabase
          .from('leads')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .or(`full_name.ilike.${q},phone.ilike.${q},email.ilike.${q},requirement.ilike.${q}`)
          .limit(10)

        setResults((data || []) as Lead[])
      } catch (err) {
        console.error('Global search error:', err)
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(handleSearch, 300)
    return () => clearTimeout(timer)
  }, [query, currentWorkspace])

  const handleSelectLead = (leadId: string) => {
    onClose()
    navigate(`/leads/${leadId}`)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Global Lead Search"
      subtitle="Search property leads by name, phone number, email, or requirement"
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Type name, phone (+1...), email or requirement..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-surface-border bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
          />
          {loading && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
            </div>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-surface-border border border-surface-border rounded-lg bg-white">
          {query.trim() === '' ? (
            <div className="p-8 text-center text-xs text-content-muted">
              Start typing to search leads across your active workspace.
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="p-8 text-center text-xs text-content-muted">
              No matching leads found for "{query}".
            </div>
          ) : (
            results.map((lead) => (
              <div
                key={lead.id}
                onClick={() => handleSelectLead(lead.id)}
                className="p-3 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 group-hover:bg-brand-blue-light text-content-muted group-hover:text-brand-blue transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-navy-900">{lead.full_name}</span>
                      <Badge
                        variant={lead.priority === 'hot' ? 'critical' : lead.priority === 'warm' ? 'warning' : 'neutral'}
                        size="sm"
                      >
                        {lead.priority.toUpperCase()}
                      </Badge>
                      <Badge variant="blue" size="sm" className="uppercase text-[9px]">
                        {lead.stage.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-content-secondary mt-0.5">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-content-muted" /> {lead.phone}
                      </span>
                      {lead.requirement && (
                        <span className="truncate max-w-[200px] text-content-muted">• {lead.requirement}</span>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-content-muted group-hover:text-brand-blue transition-colors" />
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
