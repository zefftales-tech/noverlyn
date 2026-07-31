import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { LoadingState } from '../ui/LoadingState'

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth()
  const { currentWorkspace, loading: wsLoading } = useWorkspace()

  if (authLoading || wsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-bg p-4">
        <LoadingState label="Authenticating workspace session..." />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!currentWorkspace) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
