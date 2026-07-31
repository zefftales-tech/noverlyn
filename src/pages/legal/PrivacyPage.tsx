import React from 'react'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Lock, Database } from 'lucide-react'

export const PrivacyPage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <AuthLayout title="Privacy Policy" subtitle="Noverlyn Business Operations Platform Data Privacy & Security Terms">
      <Card padding="lg" className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-surface-border pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-blue" />
            <h1 className="font-heading font-bold text-xl text-navy-900">Privacy Policy</h1>
          </div>
          <Button variant="outline" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>

        <div className="p-3 bg-brand-blue-light border border-blue-200 rounded-lg text-xs text-navy-900">
          <strong>Notice:</strong> Noverlyn uses workspace-based isolation controls to separate customer data across tenants.
        </div>

        <div className="space-y-4 text-xs text-content-secondary leading-relaxed">
          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-brand-blue" /> 1. Data Collection & Usage
            </h2>
            <p>
              We collect information necessary to operate the Noverlyn Lead Operations platform, including account registration data (name, email address, password hashes), workspace settings, team invitation logs, and operational lead data entered into your multi-tenant workspace.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-brand-blue" /> 2. Multi-Tenant Enterprise Isolation & Security
            </h2>
            <p>
              All customer lead records, activity timelines, notes, and follow-up schedules are protected using PostgreSQL Row Level Security (RLS) policies. Your workspace data is strictly isolated and can only be accessed by authenticated, active workspace members belonging to your organization.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900">
              3. Data Retention & Removal
            </h2>
            <p>
              Lead records and activities are retained for the duration of your active workspace subscription. When team members are removed from a workspace, their access is immediately revoked while preserving historical business attribution logs.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900">
              4. Contact Privacy Team
            </h2>
            <p>
              If you have questions regarding data privacy or security practices, contact us at privacy@noverlyn.com.
            </p>
          </section>
        </div>

        <div className="pt-4 border-t border-surface-border flex justify-between items-center text-[11px] text-content-muted">
          <span>Last updated: July 2026 • MVP Version 1.0</span>
          <span>© 2026 Noverlyn. All rights reserved.</span>
        </div>
      </Card>
    </AuthLayout>
  )
}
