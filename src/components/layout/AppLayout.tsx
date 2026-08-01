import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PwaInstallPrompt } from '../pwa/PwaInstallPrompt'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'
import { OfflineBanner } from '../pwa/OfflineBanner'

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col pt-safe pb-safe">
      <OfflineBanner />
      <PwaUpdateBanner />

      {/* Navigation Sidebar */}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        <Header onMobileMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <PwaInstallPrompt />
    </div>
  )
}
