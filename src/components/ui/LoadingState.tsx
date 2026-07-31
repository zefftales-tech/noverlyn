import React from 'react'
import { Loader2 } from 'lucide-react'

export interface LoadingStateProps {
  label?: string
  fullScreen?: boolean
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading workspace details...',
  fullScreen = false,
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center p-8 space-y-3">
      <div className="p-3 bg-brand-blue-light rounded-xl border border-blue-200">
        <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
      </div>
      <p className="text-xs font-medium text-content-secondary">{label}</p>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center">
        {content}
      </div>
    )
  }

  return content
}
