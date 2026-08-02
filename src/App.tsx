import React, { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { AppRouter } from './router/AppRouter'

export const App: React.FC = () => {
  useEffect(() => {
    // Attempt screen orientation lock to portrait-primary only in installed standalone PWA mode
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      if (
        'orientation' in window.screen &&
        typeof (window.screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock === 'function'
      ) {
        (window.screen.orientation as unknown as { lock: (o: string) => Promise<void> })
          .lock('portrait-primary')
          .catch(() => {
            // Silently ignore browser restrictions
          })
      }
    }
  }, [])

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
