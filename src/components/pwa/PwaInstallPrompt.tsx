import React, { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, X } from 'lucide-react'
import { Button } from '../ui/Button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
  })

  const [isIos] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const ua = window.navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream
  })

  useEffect(() => {
    if (isInstalled) return

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [isInstalled])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
    } else if (isIos) {
      setShowIosGuide(true)
    }
  }

  if (isInstalled || isDismissed) return null
  if (!deferredPrompt && !isIos) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-[140] bg-navy-900 text-white p-4 rounded-2xl shadow-2xl border border-navy-700 space-y-3 animate-in fade-in slide-in-from-bottom duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shrink-0 shadow-md">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-heading font-bold text-sm text-white">Install Noverlyn</h4>
            <p className="text-xs text-slate-300">Install Noverlyn on your device for faster access.</p>
          </div>
        </div>
        <button onClick={() => setIsDismissed(true)} className="text-slate-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {showIosGuide ? (
        <div className="p-3 bg-navy-800 rounded-xl text-xs space-y-1.5 text-slate-200 border border-navy-700">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <Share className="w-4 h-4 text-brand-blue" /> To install on iOS:
          </div>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
            <li>Tap the <strong>Share</strong> button in Safari</li>
            <li>Scroll down and select <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong> in the top right</li>
          </ol>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setIsDismissed(true)} className="text-slate-400 hover:text-white text-xs">
            Dismiss
          </Button>
          <Button variant="primary" size="sm" onClick={handleInstallClick} icon={<PlusSquare className="w-4 h-4" />}>
            Install App
          </Button>
        </div>
      )}
    </div>
  )
}
