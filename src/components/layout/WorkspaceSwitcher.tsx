import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../hooks/useWorkspace'
import { BUSINESS_TEMPLATES, type BusinessType } from '../../lib/templates'
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  RefreshCw,
  AlertCircle,
  Briefcase
} from 'lucide-react'

export const WorkspaceSwitcher: React.FC = () => {
  const {
    currentWorkspace,
    currentRole,
    workspaces,
    loading,
    error,
    switchWorkspace,
    reloadWorkspaces,
  } = useWorkspace()

  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleToggle = () => {
    const nextState = !isOpen
    setIsOpen(nextState)

    if (nextState) {
      console.log('[WorkspaceSwitcher Opened]', {
        isOpen: nextState,
        loading,
        error,
        activeWorkspace: currentWorkspace?.name || 'None',
        workspaceCount: workspaces.length,
        workspaces: workspaces.map((w) => ({
          id: w.workspace.id,
          name: w.workspace.name,
          role: w.role,
        })),
      })
    }
  }

  const bType = ((currentWorkspace as unknown as { business_type?: string })?.business_type as BusinessType) || 'real_estate'
  const currentTemplateTitle = BUSINESS_TEMPLATES[bType]?.title || 'Business Platform'

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50/90 hover:bg-slate-100/90 border border-surface-border/80 text-xs font-medium text-navy-900 transition-all duration-150 shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-6 h-6 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
          <Building2 className="w-3.5 h-3.5" />
        </div>

        <div className="text-left min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate max-w-[130px] font-bold text-navy-900">
              {currentWorkspace ? currentWorkspace.name : 'Select Workspace'}
            </span>
            {currentRole && (
              <span className="uppercase text-[9px] font-bold px-1.5 py-0.2 rounded bg-navy-900 text-white shrink-0 tracking-wider">
                {currentRole}
              </span>
            )}
          </div>
          <span className="text-[10px] text-content-secondary font-medium block truncate max-w-[140px]">
            {currentTemplateTitle}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-content-muted shrink-0 ml-1 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-navy-900' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu Container */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white shadow-xl border border-surface-border/90 py-2.5 z-[100] focus:outline-none animate-in fade-in slide-in-from-top-2 duration-150 min-w-[260px] max-h-[380px] overflow-y-auto">
          {/* Header */}
          <div className="px-3.5 pb-2 pt-1 border-b border-surface-border/50 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-content-secondary">
              Workspaces ({workspaces.length})
            </span>
            {loading && <span className="text-[10px] text-brand-blue animate-pulse">Syncing...</span>}
          </div>

          {/* Error State */}
          {error && (
            <div className="p-3 m-2 bg-red-50/60 border border-red-200 rounded-xl space-y-2 text-xs text-status-critical">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Unable to load workspaces</span>
              </div>
              <p className="text-[11px] text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => reloadWorkspaces()}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-blue hover:underline"
              >
                <RefreshCw className="w-3 h-3" /> Retry Loading
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && workspaces.length === 0 && (
            <div className="p-4 text-center space-y-2 text-xs text-content-secondary">
              <Building2 className="w-6 h-6 text-content-muted mx-auto" />
              <p className="font-semibold text-navy-900">No active workspace</p>
              <p className="text-[11px]">Create a new company workspace to get started.</p>
            </div>
          )}

          {/* Workspace Items List */}
          <div className="py-1 px-1.5 space-y-1">
            {workspaces.map((w) => {
              const isSelected = currentWorkspace?.id === w.workspace.id
              const rawBType = (w.workspace as unknown as { business_type?: string })?.business_type as BusinessType
              const templateTitle =
                BUSINESS_TEMPLATES[rawBType || 'real_estate']?.title ||
                'Business Platform'

              return (
                <button
                  key={w.workspace.id}
                  type="button"
                  onClick={() => {
                    switchWorkspace(w.workspace.id)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-colors group ${
                    isSelected
                      ? 'bg-brand-blue/8 border border-brand-blue/20'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${
                        isSelected
                          ? 'bg-brand-blue text-white shadow-xs'
                          : 'bg-slate-100 text-navy-900 group-hover:bg-slate-200'
                      }`}
                    >
                      {w.workspace.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-navy-900 truncate">
                          {w.workspace.name}
                        </span>
                        <span className="uppercase text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 shrink-0">
                          {w.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-content-secondary mt-0.5">
                        <Briefcase className="w-3 h-3 text-content-muted shrink-0" />
                        <span className="truncate">{templateTitle}</span>
                      </div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-brand-blue shrink-0 ml-2" />}
                </button>
              )
            })}
          </div>

          {/* Bottom Action: Create Workspace */}
          <div className="pt-1.5 px-1.5 border-t border-surface-border/60 mt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
                navigate('/workspaces/new')
              }}
              className="w-full text-left p-2.5 rounded-xl text-xs font-semibold text-brand-blue hover:bg-blue-50/70 flex items-center gap-2 transition-colors"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-brand-blue flex items-center justify-center shrink-0">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span>Create New Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
