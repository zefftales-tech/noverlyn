import React from 'react'
import { NoverlynLogo } from './NoverlynLogo'

interface AppLoadingScreenProps {
  message?: string
}

export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({
  message = 'Loading your workspace...',
}) => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white p-6 select-none animate-in fade-in duration-200">
      <div className="flex flex-col items-center space-y-6 max-w-xs text-center">
        {/* Noverlyn Brand Logo */}
        <div className="p-4 bg-navy-900/80 border border-navy-800 rounded-2xl shadow-2xl backdrop-blur-md">
          <NoverlynLogo variant="dark" size="lg" />
        </div>

        {/* Loading Spinner & Status Text */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative w-8 h-8">
            <div className="w-8 h-8 rounded-full border-2 border-brand-blue/30 border-t-brand-blue animate-spin" />
          </div>
          <p className="text-xs font-semibold text-slate-300 tracking-wide animate-pulse">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
