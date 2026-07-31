import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { MissingConfigError } from '../components/ui/MissingConfigError'
import { AppLayout } from '../components/layout/AppLayout'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { LoadingState } from '../components/ui/LoadingState'

import { LoginPage } from '../pages/auth/LoginPage'
import { SignupPage } from '../pages/auth/SignupPage'
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage'
import { AcceptInvitePage } from '../pages/auth/AcceptInvitePage'
import { PrivacyPage } from '../pages/legal/PrivacyPage'
import { TermsPage } from '../pages/legal/TermsPage'

import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { WorkQueuePage } from '../pages/WorkQueuePage'
import { InboxLeadsPage } from '../pages/leads/InboxLeadsPage'
import { AllLeadsPage } from '../pages/leads/AllLeadsPage'
import { CsvImportPage } from '../pages/CsvImportPage'
import { LeadDetailPage } from '../pages/leads/LeadDetailPage'
import { PipelinePage } from '../pages/PipelinePage'
import { TeamPage } from '../pages/TeamPage'
import { InsightsPage } from '../pages/InsightsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { NotFoundPage } from '../pages/NotFoundPage'

export const AppRouter: React.FC = () => {
  if (!isSupabaseConfigured) {
    return <MissingConfigError />
  }

  return (
    <Suspense fallback={<div className="p-12"><LoadingState label="Loading workspace..." /></div>}>
      <Routes>
        {/* PUBLIC AUTH & LEGAL ROUTES */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* INVITATION ACCEPTANCE ROUTE */}
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        {/* PROTECTED AUTHENTICATED APP ROUTES */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/work-queue" element={<WorkQueuePage />} />
          <Route path="/leads" element={<AllLeadsPage />} />
          <Route path="/leads/inbox" element={<InboxLeadsPage />} />
          <Route path="/leads/all" element={<AllLeadsPage />} />
          <Route path="/leads/import" element={<CsvImportPage />} />
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 404 CATCH-ALL */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
