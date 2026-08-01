import React, { useState, useEffect } from 'react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { notificationsApi, type NotificationPreferences } from '../lib/notificationsApi'
import { getTemplateForBusinessType } from '../lib/templates'
import { APP_CONFIG } from '../lib/config'
import { Sliders, Clock, Globe, Save, CheckCircle2, AlertCircle } from 'lucide-react'

export const SettingsPage: React.FC = () => {
  const { currentWorkspace, currentRole, reloadWorkspaces } = useWorkspace()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [currency, setCurrency] = useState('USD')

  // Operational thresholds
  const [hotInactivity, setHotInactivity] = useState('48')
  const [contactThreshold, setContactThreshold] = useState('4')
  const [highValueThreshold, setHighValueThreshold] = useState('')

  // Notification Preferences State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    user_id: user?.id || '',
    workspace_id: currentWorkspace?.id || '',
    public_form_alerts: true,
    assignment_alerts: true,
    followup_due_alerts: true,
    overdue_alerts: true,
    won_lost_alerts: true,
    daily_digest_enabled: true,
  })

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  useEffect(() => {
    if (currentWorkspace && user) {
      Promise.resolve().then(() => {
        setName(currentWorkspace.name || '')
        setTimezone(currentWorkspace.timezone || 'UTC')
        setCurrency(currentWorkspace.currency || 'USD')
      })

      // Fetch notification preferences
      notificationsApi.getPreferences(currentWorkspace.id, user.id).then((p) => {
        if (p) setNotifPrefs(p)
      })

      // Fetch workspace settings
      if (supabase) {
        Promise.resolve().then(async () => {
          setLoading(true)
          const { data, error: err } = await supabase!
            .from('workspace_settings' as never)
            .select('*')
            .eq('workspace_id', currentWorkspace.id)
            .single()

          const settingsRecord = (data || {}) as Record<string, unknown>
          if (data && !err) {
            if (settingsRecord.hot_lead_inactivity_hours) setHotInactivity(String(settingsRecord.hot_lead_inactivity_hours))
            if (settingsRecord.new_lead_contact_threshold_hours) setContactThreshold(String(settingsRecord.new_lead_contact_threshold_hours))
            if (settingsRecord.high_value_deal_threshold) setHighValueThreshold(String(settingsRecord.high_value_deal_threshold))
          }
          setLoading(false)
        })
      }
    }
  }, [currentWorkspace, user])

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace || !user) return

    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      // 1. Save Notification Preferences
      await notificationsApi.updatePreferences({
        ...notifPrefs,
        user_id: user.id,
        workspace_id: currentWorkspace.id,
      })

      // 2. Save Workspace Details & Settings if Owner/Manager
      if (isOwnerOrManager && supabase) {
        const { error: wsErr } = await supabase
          .from('workspaces' as never)
          .update({
            name: name.trim(),
            timezone,
            currency,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', currentWorkspace.id)

        if (wsErr) throw wsErr

        const { error: settingsErr } = await supabase
          .from('workspace_settings' as never)
          .update({
            timezone,
            currency,
            hot_lead_inactivity_hours: parseInt(hotInactivity, 10) || 48,
            new_lead_contact_threshold_hours: parseInt(contactThreshold, 10) || 4,
            high_value_deal_threshold: highValueThreshold ? parseFloat(highValueThreshold) : null,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('workspace_id', currentWorkspace.id)

        if (settingsErr) throw settingsErr

        await reloadWorkspaces()
      }

      setSuccessMsg('Settings and notification preferences updated successfully!')
    } catch (err: unknown) {
      console.error('Error saving settings:', err)
      const msg = err instanceof Error ? err.message : 'Failed to save settings'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const timezoneOptions = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
    { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  ]

  const currencyOptions = [
    { value: 'USD', label: 'USD ($) - US Dollar' },
    { value: 'EUR', label: 'EUR (€) - Euro' },
    { value: 'GBP', label: 'GBP (£) - British Pound' },
    { value: 'AED', label: 'AED (AED) - UAE Dirham' },
    { value: 'SGD', label: 'SGD (S$) - Singapore Dollar' },
    { value: 'AUD', label: 'AUD (A$) - Australian Dollar' },
    { value: 'CAD', label: 'CAD (C$) - Canadian Dollar' },
  ]

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Page Header */}
      <div className="pb-3 border-b border-surface-border flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-3xl text-navy-900 tracking-tight">
            Workspace Settings
          </h1>
          <p className="text-sm text-content-secondary mt-1">
            Manage workspace identity, operational thresholds, and notification preferences.
          </p>
        </div>

        {currentRole && (
          <Badge variant="blue" className="uppercase font-bold tracking-wider">
            Role: {currentRole}
          </Badge>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-status-success flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Workspace Identity */}
          <Card title="Workspace General Settings" subtitle="Core company name, default currency, and operational timezone">
            <div className="space-y-4">
              <Input
                label="Workspace Name *"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwnerOrManager}
                required
              />

              <Select
                label="Primary Timezone"
                options={timezoneOptions}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!isOwnerOrManager}
              />

              <Select
                label="Default Currency"
                options={currencyOptions}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!isOwnerOrManager}
              />
            </div>
          </Card>

          {/* Notification Preferences Card */}
          <Card
            title="Notification & Alert Preferences"
            subtitle="Configure which in-app operational alerts and reminders you receive."
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-navy-900 block">Public Form Lead Ingestion Alerts</span>
                  <span className="text-[11px] text-content-secondary">Alert when a visitor submits a public inquiry form.</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.public_form_alerts}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, public_form_alerts: e.target.checked })}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-navy-900 block">Lead Assignment Alerts</span>
                  <span className="text-[11px] text-content-secondary">Alert when a lead is assigned to you.</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.assignment_alerts}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, assignment_alerts: e.target.checked })}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-navy-900 block">Follow-up Due Today Reminders</span>
                  <span className="text-[11px] text-content-secondary">Alert when scheduled follow-ups reach their due date.</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.followup_due_alerts}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, followup_due_alerts: e.target.checked })}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-navy-900 block">Overdue Follow-up Alerts</span>
                  <span className="text-[11px] text-content-secondary">Alert when follow-ups pass their due date without completion.</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.overdue_alerts}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, overdue_alerts: e.target.checked })}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-navy-900 block">Deal Won / Lost Alerts</span>
                  <span className="text-[11px] text-content-secondary">Alert when deals are closed as Won or marked Lost.</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.won_lost_alerts}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, won_lost_alerts: e.target.checked })}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-surface-border/60 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-navy-900 block">Daily Morning Digest</span>
                  <span className="text-[11px] text-content-secondary">Receive a daily operational summary of due work and attention items.</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.daily_digest_enabled}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, daily_digest_enabled: e.target.checked })}
                  className="w-4 h-4 text-brand-blue rounded border-surface-border focus:ring-brand-blue"
                />
              </div>
            </div>
          </Card>

          {/* Attention Engine Operational Thresholds */}
          <Card
            title="Attention Engine Operational Thresholds"
            subtitle="Configure workspace thresholds for staleness and contact urgency"
          >
            <div className="space-y-4">
              <Input
                label="Hot Lead Inactivity Threshold (Hours)"
                type="number"
                value={hotInactivity}
                onChange={(e) => setHotInactivity(e.target.value)}
                leftIcon={<Clock className="w-4 h-4 text-brand-blue" />}
                disabled={!isOwnerOrManager}
                helperText="Flags hot leads that have not received an activity within this timeframe."
              />

              <Input
                label="New Lead Contact Threshold (Hours)"
                type="number"
                value={contactThreshold}
                onChange={(e) => setContactThreshold(e.target.value)}
                leftIcon={<Sliders className="w-4 h-4 text-brand-blue" />}
                disabled={!isOwnerOrManager}
                helperText="Flags uncontacted new leads past this threshold."
              />

              <Input
                label={`High Value Deal Threshold (${currency})`}
                type="number"
                placeholder="e.g. 250000"
                value={highValueThreshold}
                onChange={(e) => setHighValueThreshold(e.target.value)}
                leftIcon={<Globe className="w-4 h-4 text-brand-blue" />}
                disabled={!isOwnerOrManager}
                helperText="Deals equal to or above this value are categorized as High-Value Opportunities."
              />
            </div>
          </Card>

          {/* Business Vertical Template Info & Version */}
          <Card title="Business Vertical & Application Info" subtitle="Workspace template and platform release information">
            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 border border-surface-border rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-bold text-navy-900 block">Workspace Vertical Template</span>
                  <span className="text-[11px] text-content-secondary mt-0.5 block">
                    Active Template: <strong className="text-brand-blue uppercase">{getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type).title}</strong>
                  </span>
                </div>
                <Badge variant="blue">{getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type).title}</Badge>
              </div>

              <p className="text-[11px] text-content-muted">
                Business vertical templates configure default pipeline stages, labels, and terminology. To migrate your workspace template, please contact Support.
              </p>

              <div className="pt-2 border-t border-surface-border flex items-center justify-between text-[11px] text-content-secondary">
                <span>Platform Version: <strong className="text-navy-900">{APP_CONFIG.appName} {APP_CONFIG.version}</strong></span>
                <span>Environment: <strong className="text-navy-900">{APP_CONFIG.isProduction ? 'Production' : 'Development'}</strong></span>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex justify-end pt-4 border-t border-surface-border">
          <Button variant="primary" type="submit" isLoading={saving || loading} icon={<Save className="w-4 h-4" />}>
            Save All Settings & Preferences
          </Button>
        </div>
      </form>
    </div>
  )
}
