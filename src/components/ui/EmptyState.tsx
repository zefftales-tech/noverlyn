import React from 'react'
import { FolderOpen } from 'lucide-react'

export interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = <FolderOpen className="w-10 h-10 text-content-muted" />,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-surface-card border border-surface-border rounded-xl ${className}`}>
      <div className="p-4 bg-slate-50 rounded-full border border-surface-border mb-4">{icon}</div>
      <h4 className="font-heading font-bold text-navy-900 text-base mb-1">{title}</h4>
      <p className="text-xs text-content-secondary max-w-sm mb-6 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  )
}
