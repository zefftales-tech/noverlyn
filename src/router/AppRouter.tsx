import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { MissingConfigError } from '../components/ui/MissingConfigError'
import { AppLayout } from '../components/layout/AppLayout'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { LoadingState } from '../components/ui/LoadingState'

import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'

import { LoginPage } from '../pages/auth/LoginPage'
import { SignupPage } from '../pages/auth/SignupPage'
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage'
import { AcceptInvitePage } from '../pages/auth/AcceptInvitePage'
import { PrivacyPage } from '../pages/legal/PrivacyPage'
import { TermsPage } from '../pages/legal/TermsPage'

import { OnboardingWizard } from '../pages/onboarding/OnboardingWizard'
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

import { PublicLeadFormPage } from '../pages/forms/PublicLeadFormPage'
import { LeadFormsPage } from '../pages/forms/LeadFormsPage'
import { ReviewInboxPage } from '../pages/forms/ReviewInboxPage'
import { ArchivedLeadsPage } from '../pages/leads/ArchivedLeadsPage'
import { LeadTrashPage } from '../pages/leads/LeadTrashPage'

// Guard for initial first-time onboarding (/onboarding)
const OnboardingRoute: React.FC = () => {
  const { user, loading: authLoading } = useAuth()
  const { currentWorkspace, loading: wsLoading } = useWorkspace()

  if (authLoading || wsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-bg p-4">
        <LoadingState label="Loading workspace..." />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (currentWorkspace) {
    return <Navigate to="/" replace />
  }

  return <OnboardingWizard />
}

// Guard for intentional workspace creation (/workspaces/new)
const CreateWorkspaceRoute: React.FC = () => {
  const { user, loading: authLoading } = useAuth()
  const { loading: wsLoading } = useWorkspace()

  if (authLoading || wsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-bg p-4">
        <LoadingState label="Loading workspace setup..." />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <OnboardingWizard />
}

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

        {/* PUBLIC UNAUTHENTICATED LEAD CAPTURE FORM ROUTE */}
        <Route path="/forms/:slug" element={<PublicLeadFormPage />} />

        {/* FIRST-TIME ONBOARDING ROUTE */}
        <Route path="/onboarding" element={<OnboardingRoute />} />

        {/* EXPLICIT MULTI-WORKSPACE CREATION ROUTE */}
        <Route path="/workspaces/new" element={<CreateWorkspaceRoute />} />

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
          <Route path="/leads/archived" element={<ArchivedLeadsPage />} />
          <Route path="/leads/trash" element={<LeadTrashPage />} />
          <Route path="/leads/import" element={<CsvImportPage />} />
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/lead-forms" element={<LeadFormsPage />} />
          <Route path="/lead-forms/review" element={<ReviewInboxPage />} />
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
