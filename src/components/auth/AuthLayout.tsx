import React from 'react'
import { Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-surface-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Noverlyn Brand Header */}
        <div className="inline-flex flex-col items-center space-y-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center text-white shadow-md">
              <Building2 className="w-5 h-5 text-brand-blue" />
            </div>
            <span className="font-heading font-extrabold text-2xl tracking-tight text-navy-900">
              NOVERLYN
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-surface-border text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-blue" />
            Business Operations Platform
          </div>
        </div>

        <h2 className="mt-4 font-heading font-bold text-xl text-navy-900">
          {title}
        </h2>
        <p className="mt-1 text-xs text-content-secondary max-w-xs mx-auto">
          {subtitle}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface-card py-8 px-6 sm:px-10 border border-surface-border rounded-xl shadow-xs space-y-6">
          {children}
        </div>

        {/* Brand footer */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-[11px] text-content-muted">
            © 2026 Noverlyn. All rights reserved.
          </p>
          <div className="flex justify-center items-center gap-3 text-[11px] text-content-secondary font-medium">
            <Link to="/privacy" className="hover:text-brand-blue transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-brand-blue transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
