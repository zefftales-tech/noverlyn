import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { AppRouter } from './router/AppRouter'

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <AppRouter />
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
