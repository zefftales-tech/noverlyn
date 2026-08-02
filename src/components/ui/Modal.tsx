import React, { useEffect } from 'react'
import { X } from 'lucide-react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop Overlay */}
      <div className="fixed inset-0 bg-navy-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Card Panel */}
      <div
        className={`relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-surface-border w-full ${widths[maxWidth]} max-h-[92dvh] sm:max-h-[85dvh] flex flex-col overflow-hidden z-10 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 pb-safe`}
      >
        {/* 1. Fixed Header (shrink-0) */}
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between shrink-0 bg-white z-10">
          <div className="min-w-0 pr-3">
            <h3 className="font-heading font-bold text-base sm:text-lg text-navy-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-content-secondary mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Scrollable Form Body (flex-1 min-h-0 overflow-y-auto) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          {children}
        </div>

        {/* 3. Fixed Footer (shrink-0) */}
        {footer && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-surface-border flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
