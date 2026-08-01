import React, { useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'

export const PwaUpdateBanner: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateSW, setUpdateSW] = useState<(() => void) | null>(null)

  useEffect(() => {
    // Dynamically register SW update listener if vite-plugin-pwa registerSW is present
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return
        reg.onupdatefound = () => {
          const installingWorker = reg.installing
          if (!installingWorker) return
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setNeedRefresh(true)
              setUpdateSW(() => () => {
                reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
                window.location.reload()
              })
            }
          }
        }
      })
    }
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed top-4 right-4 z-[150] bg-brand-blue text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-blue-400 animate-in fade-in slide-in-from-top duration-200">
      <Sparkles className="w-5 h-5 text-amber-300 shrink-0" />
      <div className="text-xs">
        <strong className="block font-bold">New version available</strong>
        <span className="text-blue-100 text-[11px]">Update Noverlyn to get the latest fixes.</span>
      </div>
      <Button
        variant="primary"
        size="sm"
        icon={<RefreshCw className="w-3.5 h-3.5" />}
        onClick={() => {
          if (updateSW) updateSW()
          else window.location.reload()
        }}
        className="bg-white text-navy-900 hover:bg-slate-100 font-bold ml-2"
      >
        Update Now
      </Button>
    </div>
  )
}
