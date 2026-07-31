import React from 'react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { Dropdown } from '../ui/Dropdown'
import { Building2, ChevronDown, Check, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export const WorkspaceSwitcher: React.FC = () => {
  const { currentWorkspace, currentRole, workspaces, switchWorkspace } = useWorkspace()
  const navigate = useNavigate()

  if (!currentWorkspace) return null

  const items = [
    ...workspaces.map((w) => ({
      id: w.workspace.id,
      label: w.workspace.name,
      icon: w.workspace.id === currentWorkspace.id ? <Check className="w-4 h-4 text-brand-blue" /> : <Building2 className="w-4 h-4 text-content-muted" />,
      onClick: () => switchWorkspace(w.workspace.id),
    })),
    {
      id: 'create-new',
      label: '+ Create New Workspace',
      icon: <Plus className="w-4 h-4 text-brand-blue" />,
      onClick: () => navigate('/onboarding'),
    },
  ]

  return (
    <Dropdown
      align="left"
      trigger={
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-surface-border text-xs font-medium text-navy-900 transition-colors">
          <Building2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
          <span className="truncate max-w-[140px] font-semibold">{currentWorkspace.name}</span>
          {currentRole && (
            <span className="uppercase text-[9px] font-bold px-1.5 py-0.2 rounded bg-navy-900 text-white shrink-0">
              {currentRole}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" />
        </button>
      }
      items={items}
    />
  )
}
