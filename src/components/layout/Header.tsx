import React, { useState, useEffect } from 'react'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { Dropdown } from '../ui/Dropdown'
import { Avatar } from '../ui/Avatar'
import { AddLeadModal } from '../leads/AddLeadModal'
import { SearchModal } from '../ui/SearchModal'
import { SendFeedbackModal } from '../ui/SendFeedbackModal'
import { NotificationCenter } from './NotificationCenter'
import { NoverlynLogo } from '../ui/NoverlynLogo'
import { Search, Plus, Menu, LogOut, User, Shield, MessageSquare } from 'lucide-react'

export interface HeaderProps {
  onMobileMenuToggle: () => void
}

export const Header: React.FC<HeaderProps> = ({ onMobileMenuToggle }) => {
  const { profile, signOut } = useAuth()

  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)

  // Listen for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <header className="h-16 bg-surface-card border-b border-surface-border sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
        {/* Left section: Mobile toggle & Workspace Switcher */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            className="p-2 rounded-lg text-content-secondary hover:text-navy-900 hover:bg-slate-100 lg:hidden transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="lg:hidden">
            <NoverlynLogo variant="mark" size="sm" />
          </div>

          <WorkspaceSwitcher />
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden md:flex items-center max-w-lg w-full mx-6">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search leads, phone numbers, contacts... (Ctrl + K)"
              readOnly
              onClick={() => setIsSearchOpen(true)}
              className="w-full pl-10 pr-12 py-2 rounded-xl border border-surface-border/80 bg-slate-50/80 text-xs text-navy-900 placeholder:text-content-muted cursor-pointer hover:bg-white hover:border-slate-300 transition-all duration-150 shadow-2xs focus:outline-none"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-content-muted bg-white border border-surface-border rounded-md shadow-2xs">
                Ctrl K
              </kbd>
            </div>
          </div>
        </div>

        {/* Right section: CTA, Notifications, Profile Menu */}
        <div className="flex items-center gap-3">
          {/* Functional + Add Lead Button */}
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddLeadOpen(true)}
            className="hidden sm:inline-flex shadow-xs font-semibold"
          >
            Add Lead
          </Button>

          {/* Functional Notification Center */}
          <NotificationCenter />

          {/* User Profile Menu */}
          <Dropdown
            align="right"
            trigger={
              <button className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors">
                <Avatar name={profile?.full_name || 'User'} url={profile?.avatar_url} size="sm" />
              </button>
            }
            items={[
              {
                id: 'profile',
                label: profile?.full_name || 'My Profile',
                icon: <User className="w-4 h-4 text-content-muted" />,
                onClick: () => {},
              },
              {
                id: 'security',
                label: 'Account Security',
                icon: <Shield className="w-4 h-4 text-content-muted" />,
                onClick: () => {},
              },
              {
                id: 'feedback',
                label: 'Send Feedback',
                icon: <MessageSquare className="w-4 h-4 text-brand-blue" />,
                onClick: () => setIsFeedbackOpen(true),
              },
              {
                id: 'signout',
                label: 'Sign Out',
                icon: <LogOut className="w-4 h-4 text-status-critical" />,
                variant: 'danger',
                onClick: () => signOut(),
              },
            ]}
          />
        </div>
      </header>

      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onSuccess={() => {
          // Trigger custom event so active pages refresh list
          window.dispatchEvent(new Event('noverlyn:lead_created'))
        }}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      {/* Send Feedback Modal */}
      <SendFeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </>
  )
}
