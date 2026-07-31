import React from 'react'
import { AlertTriangle, Key, Terminal, ExternalLink } from 'lucide-react'

export const MissingConfigError: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center p-6 text-content-primary">
      <div className="max-w-md w-full bg-surface-card border border-surface-border rounded-xl shadow-lg p-6 space-y-6">
        <div className="flex items-center gap-3 text-status-warning">
          <div className="p-3 bg-status-warning-bg rounded-lg border border-amber-200">
            <AlertTriangle className="w-6 h-6 text-status-warning" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-lg text-navy-900">Supabase Configuration Required</h1>
            <p className="text-xs text-content-secondary">Environment setup incomplete</p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-content-secondary">
          <p>
            Noverlyn runs as a standalone commercial B2B SaaS platform using Supabase authentication and multi-tenant RLS data security.
          </p>
          
          <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs space-y-2 border border-slate-700">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> .env</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-blue">Required</span>
            </div>
            <div>VITE_SUPABASE_URL=your_project_url</div>
            <div>VITE_SUPABASE_ANON_KEY=your_anon_key</div>
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-medium text-navy-900 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-brand-blue" /> How to resolve:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-content-secondary pl-1">
              <li>Create a Supabase project or start local Supabase.</li>
              <li>Copy <code className="bg-slate-100 px-1 py-0.5 rounded text-navy-900">.env.example</code> to <code className="bg-slate-100 px-1 py-0.5 rounded text-navy-900">.env</code>.</li>
              <li>Apply migration from <code className="bg-slate-100 px-1 py-0.5 rounded text-navy-900">supabase/migrations/</code>.</li>
              <li>Restart the local Vite server (<code className="bg-slate-100 px-1 py-0.5 rounded text-navy-900">npm run dev</code>).</li>
            </ol>
          </div>
        </div>

        <div className="pt-2 border-t border-surface-border flex justify-between items-center text-xs text-content-muted">
          <span>Noverlyn Business Operations Platform</span>
          <a 
            href="https://supabase.com/docs" 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-blue hover:underline font-medium"
          >
            Supabase Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
