import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { formsApi } from '../../lib/formsApi'
import { Avatar } from '../ui/Avatar'
import {
  Home,
  CheckSquare,
  Users,
  GitPullRequest,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  LogOut,
  Inbox,
  List,
  Upload,
  X,
  FileText,
  Archive,
  Trash2,
  MessageSquare,
  UserCheck,
  Sparkles,
} from 'lucide-react'

import { getTemplateForBusinessType } from '../../lib/templates'
import { NoverlynLogo } from '../ui/NoverlynLogo'

export interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const { profile, signOut } = useAuth()
  const { currentWorkspace, currentRole } = useWorkspace()
  const location = useLocation()

  const [pendingReviewCount, setPendingReviewCount] = useState(0)

  const activeTemplate = getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type)

  // Leads dropdown expanded state
  const isLeadsActive = location.pathname.startsWith('/leads')
  const [leadsExpanded, setLeadsExpanded] = useState<boolean>(isLeadsActive || true)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  useEffect(() => {
    if (!currentWorkspace || !isOwnerOrManager) return
    let isSubscribed = true

    formsApi
      .getPendingCount(currentWorkspace.id)
      .then((cnt) => {
        if (isSubscribed) setPendingReviewCount(cnt)
      })
      .catch(() => {})

    return () => {
      isSubscribed = false
    }
  }, [currentWorkspace, isOwnerOrManager, location.pathname])

  const navItems = [
    { to: '/', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { to: '/work-queue', label: 'Work Queue', icon: <CheckSquare className="w-4 h-4" /> },
  ]

  const leadsSubItems = [
    { to: '/leads/inbox', label: 'Inbox', icon: <Inbox className="w-3.5 h-3.5" /> },
    { to: '/leads/all', label: 'All Leads', icon: <List className="w-3.5 h-3.5" /> },
    { to: '/leads/import', label: 'Import', icon: <Upload className="w-3.5 h-3.5" /> },
    { to: '/leads/archived', label: 'Archived', icon: <Archive className="w-3.5 h-3.5" /> },
    { to: '/leads/trash', label: 'Trash', icon: <Trash2 className="w-3.5 h-3.5" /> },
  ]

  const bottomNavItems = [
    { to: '/pipeline', label: 'Pipeline', icon: <GitPullRequest className="w-4 h-4" /> },
    { to: '/recovery', label: 'Revenue Recovery', icon: <Sparkles className="w-4 h-4 text-indigo-400" /> },
    { to: '/whatsapp/inbox', label: 'WhatsApp Inbox', icon: <MessageSquare className="w-4 h-4 text-emerald-400" /> },
    ...(isOwnerOrManager
      ? [{ to: '/whatsapp/review', label: 'Contact Reviews', icon: <UserCheck className="w-4 h-4 text-brand-blue" /> }]
      : []),
    {
      to: '/lead-forms',
      label: 'Lead Forms',
      icon: <FileText className="w-4 h-4" />,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    ...(isOwnerOrManager
      ? [{ to: '/lead-forms/review', label: 'Review Inbox', icon: <Inbox className="w-4 h-4" />, badge: pendingReviewCount > 0 ? pendingReviewCount : undefined }]
      : []),
    { to: '/team', label: 'Team', icon: <Users className="w-4 h-4" /> },
    { to: '/insights', label: 'Insights', icon: <BarChart3 className="w-4 h-4" /> },
    { to: '/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ]

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-navy-900 text-slate-300 w-64 select-none">
      {/* Top Header */}
      <div>
        <div className="p-5 border-b border-navy-800 flex items-center justify-between">
          <NoverlynLogo variant="dark" size="md" sublabel={activeTemplate.title} />
          {mobileOpen && (
            <button onClick={onMobileClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 lg:hidden">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 text-xs">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-xs'
                    : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Leads Expandable Group */}
          <div>
            <button
              onClick={() => setLeadsExpanded(!leadsExpanded)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-colors ${
                isLeadsActive
                  ? 'bg-navy-800 text-white'
                  : 'text-slate-300 hover:bg-navy-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-slate-300" />
                <span>Leads</span>
              </div>
              {leadsExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {leadsExpanded && (
              <div className="mt-1 ml-4 pl-3 border-l border-navy-800 space-y-1">
                {leadsSubItems.map((sub) => (
                  <NavLink
                    key={sub.to}
                    to={sub.to}
                    onClick={onMobileClose}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-blue text-white'
                          : 'text-slate-400 hover:bg-navy-800 hover:text-slate-200'
                      }`
                    }
                  >
                    {sub.icon}
                    <span>{sub.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-xs'
                    : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                }`
              }
            >
              <div className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="bg-brand-amber text-navy-950 font-extrabold text-[10px] px-1.5 py-0.2 rounded-full">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Bottom Profile Footer */}
      <div className="p-3 border-t border-navy-800/80 bg-navy-900">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-navy-800/40 border border-navy-800/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={profile?.full_name || 'User'} url={profile?.avatar_url} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">{profile?.full_name || 'Agent'}</p>
              {currentRole && (
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mt-0.5">
                  {currentRole}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-status-critical hover:bg-navy-800 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 shadow-md">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-navy-900/60 backdrop-blur-xs" onClick={onMobileClose} />
          <div className="fixed inset-y-0 left-0 z-10 w-64 shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
