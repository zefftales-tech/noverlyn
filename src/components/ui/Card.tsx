import React from 'react'

export interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  action,
  padding = 'md',
}) => {
  const paddings = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  return (
    <div className={`bg-surface-card border border-surface-border/80 rounded-2xl shadow-saas ${className}`}>
      {(title || action) && (
        <div className="px-6 py-4.5 border-b border-surface-border/60 flex items-center justify-between">
          <div>
            {title && <h3 className="font-heading font-bold text-base text-navy-900">{title}</h3>}
            {subtitle && <p className="text-xs text-content-secondary mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={paddings[padding]}>{children}</div>
    </div>
  )
}
