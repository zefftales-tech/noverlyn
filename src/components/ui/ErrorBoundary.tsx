import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Noverlyn Global Error Boundary]', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV

      return (
        <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface-card border border-surface-border rounded-xl p-6 sm:p-8 text-center space-y-5 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 text-status-critical flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy-900">Something went wrong</h2>
              <p className="text-xs text-content-secondary mt-1">
                An unexpected error occurred. Please try reloading the application.
              </p>
            </div>

            {isDev && this.state.error && (
              <div className="p-3 bg-slate-900 text-slate-200 text-left font-mono text-[11px] rounded-lg overflow-x-auto max-h-40">
                <strong className="block text-red-400 mb-1">{this.state.error.name}: {this.state.error.message}</strong>
                <span>{this.state.error.stack}</span>
              </div>
            )}

            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
