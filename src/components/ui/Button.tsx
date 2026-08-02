import React from 'react'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: React.ReactNode
  href?: string
  target?: string
  rel?: string
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  href,
  target,
  rel,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none'

  const variants = {
    primary: 'bg-brand-blue text-white hover:bg-brand-blue-hover focus:ring-brand-blue shadow-sm',
    secondary: 'bg-navy-900 text-white hover:bg-navy-800 focus:ring-navy-900 shadow-sm',
    outline: 'bg-white border border-surface-border text-content-primary hover:bg-slate-50 hover:border-slate-400 focus:ring-brand-blue',
    ghost: 'bg-transparent text-content-secondary hover:bg-slate-100 hover:text-content-primary focus:ring-slate-400',
    danger: 'bg-status-critical text-white hover:bg-red-700 focus:ring-status-critical shadow-sm',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2.5',
  }

  const combinedClasses = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`

  // Render native <a> anchor element if href is provided and button is enabled
  if (href && !disabled && !isLoading) {
    return (
      <a
        href={href}
        target={target || '_blank'}
        rel={rel || 'noopener noreferrer'}
        className={combinedClasses}
        title={props.title}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{children}</span>
      </a>
    )
  }

  return (
    <button
      className={combinedClasses}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  )
}
