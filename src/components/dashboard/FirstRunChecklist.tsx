import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { CheckCircle2, Circle, X, Plus, UserPlus, FileSpreadsheet, Calendar, Sparkles } from 'lucide-react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { supabase } from '../../lib/supabase'

export const FirstRunChecklist: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [hasLead, setHasLead] = useState(false)
  const [hasTeam, setHasTeam] = useState(false)
  const [hasFollowUp, setHasFollowUp] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentWorkspace || !supabase) return

    const checkProgress = async () => {
      const storageKey = `noverlyn_dismiss_checklist_${currentWorkspace.id}`
      if (localStorage.getItem(storageKey) === 'true') {
        setDismissed(true)
        setLoading(false)
        return
      }
      try {
        // Check leads count
        const { count: leadsCount } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', currentWorkspace.id)

        // Check members or invitations count
        const { count: memsCount } = await supabase
          .from('workspace_members')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', currentWorkspace.id)

        const { count: invsCount } = await supabase
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', currentWorkspace.id)

        // Check follow-ups count
        const { count: followUpsCount } = await supabase
          .from('follow_ups')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', currentWorkspace.id)

        setHasLead((leadsCount || 0) > 0)
        setHasTeam((memsCount || 0) > 1 || (invsCount || 0) > 0)
        setHasFollowUp((followUpsCount || 0) > 0)
      } catch (err) {
        console.error('[Checklist fetch error]', err)
      } finally {
        setLoading(false)
      }
    }

    checkProgress()
  }, [currentWorkspace])

  if (dismissed || loading || !currentWorkspace) return null

  const items = [
    {
      title: 'Workspace Created',
      description: 'Multi-tenant real estate lead operations workspace is active.',
      completed: true,
    },
    {
      title: 'Add or Import First Lead',
      description: 'Create your first lead manually or batch import from CSV spreadsheet.',
      completed: hasLead,
      action: (
        <div className="flex gap-2 mt-1.5">
          <Button variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate('/leads')}>
            Add Lead
          </Button>
          <Button variant="outline" size="sm" icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />} onClick={() => navigate('/leads/import')}>
            Import CSV
          </Button>
        </div>
      ),
    },
    {
      title: 'Invite Team Member',
      description: 'Invite sales agents and operations managers to collaborate.',
      completed: hasTeam,
      action: (
        <div className="mt-1.5">
          <Button variant="outline" size="sm" icon={<UserPlus className="w-3.5 h-3.5 text-brand-blue" />} onClick={() => navigate('/team')}>
            Invite Member
          </Button>
        </div>
      ),
    },
    {
      title: 'Schedule First Follow-Up',
      description: 'Set a call, meeting, or viewing follow-up to activate the Attention Engine.',
      completed: hasFollowUp,
      action: (
        <div className="mt-1.5">
          <Button variant="outline" size="sm" icon={<Calendar className="w-3.5 h-3.5 text-brand-blue" />} onClick={() => navigate('/work-queue')}>
            Open Work Queue
          </Button>
        </div>
      ),
    },
  ]

  const completedCount = items.filter((i) => i.completed).length
  if (completedCount === 4) return null

  const handleDismiss = () => {
    if (!currentWorkspace) return
    localStorage.setItem(`noverlyn_dismiss_checklist_${currentWorkspace.id}`, 'true')
    setDismissed(true)
  }

  return (
    <Card padding="md" className="border-brand-blue/30 bg-gradient-to-r from-blue-50/50 to-slate-50 relative overflow-hidden">
      <div className="flex items-center justify-between pb-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-blue shrink-0" />
          <div>
            <h3 className="font-heading font-bold text-sm text-navy-900">
              Workspace Getting Started Checklist ({completedCount}/4 Completed)
            </h3>
            <p className="text-xs text-content-secondary">
              Complete these steps to activate your real estate lead operations pipeline.
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-content-muted hover:text-navy-900 p-1 rounded-md transition-colors"
          title="Dismiss Checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`p-3.5 rounded-xl border transition-all ${
              item.completed
                ? 'bg-emerald-50/40 border-emerald-200'
                : 'bg-white border-surface-border shadow-2xs'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {item.completed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-content-muted shrink-0 mt-0.5" />
              )}
              <div>
                <span className={`text-xs font-bold block ${item.completed ? 'text-emerald-900 line-through' : 'text-navy-900'}`}>
                  {item.title}
                </span>
                <p className="text-[11px] text-content-secondary mt-0.5">{item.description}</p>
                {!item.completed && item.action}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
