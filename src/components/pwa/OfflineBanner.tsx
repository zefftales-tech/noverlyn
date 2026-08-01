import React, { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 select-none shadow-md z-[150] sticky top-0">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You're offline. Some live features may be unavailable.</span>
    </div>
  )
}
