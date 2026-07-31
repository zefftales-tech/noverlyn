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
        <button className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50/90 hover:bg-slate-100/90 border border-surface-border/80 text-xs font-medium text-navy-900 transition-all duration-150 shadow-2xs">
          <Building2 className="w-4 h-4 text-brand-blue shrink-0" />
          <span className="truncate max-w-[140px] font-bold text-navy-900">{currentWorkspace.name}</span>
          {currentRole && (
            <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-navy-900 text-white shrink-0 tracking-wider">
              {currentRole}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0 ml-0.5" />
        </button>
      }
      items={items}
    />
  )
}
