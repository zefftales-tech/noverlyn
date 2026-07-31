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
    default: 'bg-slate-100/80 text-slate-700 border-slate-200/80',
    neutral: 'bg-slate-100/80 text-content-secondary border-surface-border/80',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/70',
    critical: 'bg-red-50 text-red-700 border-red-200/70',
    blue: 'bg-blue-50 text-brand-blue border-blue-200/70',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-0.5 text-xs',
  }

  return (
    <span className={`inline-flex items-center font-medium border rounded-full ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  )
}
