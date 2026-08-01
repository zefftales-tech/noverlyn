import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { AppLoadingScreen } from '../ui/AppLoadingScreen'

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth()
  const { currentWorkspace, loading: wsLoading } = useWorkspace()

  if (authLoading || wsLoading) {
    return <AppLoadingScreen message="Loading your workspace..." />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!currentWorkspace) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
