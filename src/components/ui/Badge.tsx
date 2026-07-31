import React from 'react'

export interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'neutral' | 'success' | 'warning' | 'critical' | 'blue'
  size?: 'sm' | 'md'
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    neutral: 'bg-slate-100 text-content-secondary border-surface-border',
    success: 'bg-status-success-bg text-status-success border-emerald-200',
    warning: 'bg-status-warning-bg text-status-warning border-amber-200',
    critical: 'bg-status-critical-bg text-status-critical border-red-200',
    blue: 'bg-brand-blue-light text-brand-blue border-blue-200',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  }

  return (
    <span className={`inline-flex items-center font-medium border rounded-full ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  )
}
