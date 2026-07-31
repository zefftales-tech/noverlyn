import React from 'react'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, CheckCircle2, ShieldAlert } from 'lucide-react'

export const TermsPage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <AuthLayout title="Terms of Service" subtitle="Noverlyn Business Operations Platform User Agreement">
      <Card padding="lg" className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-surface-border pb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand-blue" />
            <h1 className="font-heading font-bold text-xl text-navy-900">Terms of Service</h1>
          </div>
          <Button variant="outline" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>

        <div className="space-y-4 text-xs text-content-secondary leading-relaxed">
          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 1. Acceptance of Terms
            </h2>
            <p>
              By creating an account, initializing a workspace, or accepting an invitation link to Noverlyn, you agree to comply with and be bound by these Terms of Service.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-brand-blue" /> 2. Workspace Responsibilities & Roles
            </h2>
            <p>
              Workspace Owners and Managers are responsible for managing member invitations, assigned roles, and data access permissions. You agree to use Noverlyn only for lawful lead operations and client communication tracking.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900">
              3. Service Availability & MVP Scope
            </h2>
            <p>
              Noverlyn is provided on an "as is" and "as available" basis for business operations. We strive for high service uptime and data availability across all multi-tenant workspaces.
            </p>
          </section>

          <section className="space-y-1.5">
            <h2 className="font-heading font-bold text-sm text-navy-900">
              4. Termination & Disabling Access
            </h2>
            <p>
              Workspace administrators reserve the right to disable or remove members from their workspace at any time. Account termination preserves historical business records and audit trails.
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
