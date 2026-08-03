import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { notificationsApi, type NotificationPreferences } from '../lib/notificationsApi'
import { whatsappCloudApi, type WhatsAppConnection, type WebhookEvent } from '../lib/whatsappCloudApi'
import { ConnectWhatsAppModal } from '../components/communications/ConnectWhatsAppModal'
import { SendTestMessageModal } from '../components/communications/SendTestMessageModal'
import {
  Sliders,
  Clock,
  Globe,
  Save,
  CheckCircle2,
  AlertCircle,
  Building2,
  Bell,
  Smartphone,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Send,
  Unplug,
  Copy,
  Check,
  Info
} from 'lucide-react'

type SettingsTab = 'workspace' | 'attention' | 'whatsapp' | 'notifications' | 'platform'

export const SettingsPage: React.FC = () => {
  const { currentWorkspace, currentRole, reloadWorkspaces } = useWorkspace()
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState<SettingsTab>('workspace')
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

  // WhatsApp Cloud API Integration State
  const [waConn, setWaConn] = useState<WhatsAppConnection | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
  const [waLoading, setWaLoading] = useState(false)
  const [waVerifying, setWaVerifying] = useState(false)
  const [waDisconnecting, setWaDisconnecting] = useState(false)

  // Modals state
  const [isConnectOpen, setIsConnectOpen] = useState(false)
  const [isTestMsgOpen, setIsTestMsgOpen] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const isOwner = currentRole === 'owner'
  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  const loadWhatsAppConnection = useCallback(async () => {
    if (!currentWorkspace) return
    setWaLoading(true)
    try {
      const conn = await whatsappCloudApi.getConnection(currentWorkspace.id)
      setWaConn(conn)

      if (conn && isOwnerOrManager) {
        const events = await whatsappCloudApi.getWebhookEvents(currentWorkspace.id)
        setWebhookEvents(events)
      }
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setWaLoading(false)
    }
  }, [currentWorkspace, isOwnerOrManager])

  useEffect(() => {
    if (!currentWorkspace || !user) return
    const timer = setTimeout(() => {
      setName(currentWorkspace.name || '')
      setTimezone(currentWorkspace.timezone || 'UTC')
      setCurrency(currentWorkspace.currency || 'USD')

      // Fetch notification preferences
      notificationsApi.getPreferences(currentWorkspace.id, user.id).then((p) => {
        if (p) setNotifPrefs(p)
      })

      // Fetch WhatsApp Connection status
      loadWhatsAppConnection()

      // Fetch workspace settings
      if (supabase) {
        supabase
          .from('workspace_settings' as never)
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .single()
          .then(({ data, error: err }) => {
            const settingsRecord = (data || {}) as Record<string, unknown>
            if (data && !err) {
              if (settingsRecord.hot_lead_inactivity_hours) setHotInactivity(String(settingsRecord.hot_lead_inactivity_hours))
              if (settingsRecord.new_lead_contact_threshold_hours) setContactThreshold(String(settingsRecord.new_lead_contact_threshold_hours))
              if (settingsRecord.high_value_deal_threshold) setHighValueThreshold(String(settingsRecord.high_value_deal_threshold))
            }
          })
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [currentWorkspace, user, loadWhatsAppConnection])

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

      // 2. Save Workspace Details (Owner only)
      if (isOwner && supabase) {
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
        await reloadWorkspaces()
      }

      // 3. Save Workspace Settings
      if (isOwnerOrManager && supabase) {
        const { error: setErr } = await supabase
          .from('workspace_settings' as never)
          .upsert({
            workspace_id: currentWorkspace.id,
            hot_lead_inactivity_hours: Number(hotInactivity) || 48,
            new_lead_contact_threshold_hours: Number(contactThreshold) || 4,
            high_value_deal_threshold: highValueThreshold ? Number(highValueThreshold) : null,
            updated_at: new Date().toISOString(),
          } as never)

        if (setErr) throw setErr
      }

      setSuccessMsg('Settings updated successfully.')
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save settings'
      setError(errorMsg)
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyConnection = async () => {
    if (!currentWorkspace) return
    setWaVerifying(true)
    try {
      await whatsappCloudApi.verify(currentWorkspace.id)
      await loadWhatsAppConnection()
      setSuccessMsg('WhatsApp Cloud API connection verified successfully!')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setWaVerifying(false)
    }
  }

  const handleDisconnect = async () => {
    if (!currentWorkspace) return
    if (!confirm('Disconnect WhatsApp Cloud API from this workspace? Automatic messaging and webhook processing will stop. Your existing Noverlyn communication history will remain intact.')) return

    setWaDisconnecting(true)
    try {
      await whatsappCloudApi.disconnect(currentWorkspace.id)
      await loadWhatsAppConnection()
      setSuccessMsg('WhatsApp Cloud API disconnected safely.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setWaDisconnecting(false)
    }
  }

  const supabaseUrlBase = (import.meta.env.VITE_SUPABASE_URL as string || 'https://project-ref.supabase.co').replace(/\/$/, '')
  const webhookPublicUrl = `${supabaseUrlBase}/functions/v1/whatsapp-webhook`

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookPublicUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const isWaConnected = waConn?.status === 'connected'

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto px-1 sm:px-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <h1 className="font-heading font-bold text-2xl text-navy-900">Workspace Settings</h1>
          <p className="text-xs text-content-secondary mt-1">
            Manage your workspace configuration, WhatsApp Cloud API integration, rules, and alerts.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-border text-xs font-semibold overflow-x-auto pb-1">
        {[
          { key: 'workspace', label: 'Workspace Profile', icon: Building2 },
          { key: 'whatsapp', label: 'WhatsApp Cloud API', icon: MessageSquare },
          { key: 'attention', label: 'Attention Rules', icon: Sliders },
          { key: 'notifications', label: 'Notifications & Alerts', icon: Bell },
          { key: 'platform', label: 'Platform & PWA', icon: Smartphone },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as SettingsTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl border-b-2 font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'border-brand-blue text-brand-blue bg-blue-50/50 font-bold'
                  : 'border-transparent text-content-secondary hover:text-navy-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: WORKSPACE PROFILE */}
      {activeTab === 'workspace' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <Card title="Workspace Identity" subtitle="Core organization preferences and localized defaults">
            <div className="space-y-4 text-xs">
              <Input
                label="Workspace Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Primary Timezone"
                  options={[
                    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
                    { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +04:00)' },
                    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
                    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
                    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +08:00)' },
                  ]}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!isOwner}
                />

                <Select
                  label="Operating Currency"
                  options={[
                    { value: 'USD', label: 'USD ($) — US Dollar' },
                    { value: 'AED', label: 'AED (AED) — UAE Dirham' },
                    { value: 'EUR', label: 'EUR (€) — Euro' },
                    { value: 'GBP', label: 'GBP (£) — British Pound' },
                    { value: 'CAD', label: 'CAD ($) — Canadian Dollar' },
                  ]}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={!isOwner}
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" type="submit" isLoading={saving} icon={<Save className="w-4 h-4" />}>
              Save Workspace Settings
            </Button>
          </div>
        </form>
      )}

      {/* TAB 2: WHATSAPP CLOUD API INTEGRATION */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <Card
            title="Official Meta WhatsApp Cloud API Integration"
            subtitle="Connect your Meta WhatsApp Business assets for automated delivery and official messaging"
            action={
              isWaConnected ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<RefreshCw className={`w-3.5 h-3.5 ${waVerifying ? 'animate-spin' : ''}`} />}
                    onClick={handleVerifyConnection}
                    isLoading={waVerifying}
                  >
                    Verify
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Send className="w-3.5 h-3.5 text-emerald-400" />}
                    onClick={() => setIsTestMsgOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Send Test Message
                  </Button>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Unplug className="w-3.5 h-3.5 text-status-critical" />}
                      onClick={handleDisconnect}
                      isLoading={waDisconnecting}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              ) : isOwner ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<MessageSquare className="w-3.5 h-3.5 text-emerald-400" />}
                  onClick={() => setIsConnectOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Connect WhatsApp Business
                </Button>
              ) : null
            }
          >
            {waLoading ? (
              <div className="py-6 text-center text-xs text-content-secondary">Loading WhatsApp connection status...</div>
            ) : isWaConnected ? (
              <div className="space-y-4 text-xs">
                {/* Connected Status Banner */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-navy-900">
                          {waConn?.verified_name || 'Meta WhatsApp Business'}
                        </span>
                        <Badge variant="success" className="uppercase font-bold text-[10px]">
                          CONNECTED VIA CLOUD API
                        </Badge>
                      </div>
                      <p className="text-xs text-content-secondary mt-0.5">
                        Display Phone: <strong className="text-navy-900">{waConn?.display_phone_number || waConn?.phone_number_id}</strong> • WABA ID: <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border">{waConn?.whatsapp_business_account_id}</code>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 border border-surface-border rounded-xl">
                    <span className="text-content-secondary block text-[11px]">Quality Rating</span>
                    <span className="font-bold text-navy-900 text-sm">{waConn?.quality_rating || 'GREEN'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-surface-border rounded-xl">
                    <span className="text-content-secondary block text-[11px]">Last Verified</span>
                    <span className="font-semibold text-navy-900">
                      {waConn?.last_verified_at ? new Date(waConn.last_verified_at).toLocaleString() : 'Just now'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-surface-border rounded-xl">
                    <span className="text-content-secondary block text-[11px]">Last Webhook Event</span>
                    <span className="font-semibold text-navy-900">
                      {waConn?.last_webhook_at ? new Date(waConn.last_webhook_at).toLocaleString() : 'No webhooks received yet'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-50 border border-dashed rounded-xl space-y-3">
                <MessageSquare className="w-10 h-10 text-content-muted mx-auto" />
                <div>
                  <h4 className="font-bold text-navy-900 text-sm">WhatsApp Cloud API Disconnected</h4>
                  <p className="text-xs text-content-secondary mt-1 max-w-md mx-auto">
                    Connect your Meta WhatsApp Business Account to receive webhooks and send messages directly through official Meta Cloud infrastructure.
                  </p>
                </div>
                {isOwner && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<MessageSquare className="w-4 h-4 text-emerald-400" />}
                    onClick={() => setIsConnectOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    Connect WhatsApp Business
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Phase 9A Compatibility Info Box */}
          <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3 text-xs">
            <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
            <div className="space-y-1 text-content-secondary">
              <span className="font-bold text-navy-900 block">Phase 9A Manual Workflow Preserved</span>
              <p>
                Your team's working Phase 9A WhatsApp workflow (quick <code>wa.me</code> links, manual incoming/outgoing message logging, reusable templates, timeline history, and response tracking) remains 100% active and fully available at all times.
              </p>
            </div>
          </div>

          {/* OWNER-ONLY WEBHOOK DIAGNOSTICS PANEL */}
          {isOwnerOrManager && (
            <Card title="Webhook Diagnostics & Event Log" subtitle="Meta Cloud API webhook listener endpoint and recent event activity">
              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl space-y-2 font-mono">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-slate-400 font-sans font-bold text-xs">Meta Webhook Endpoint URL:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyWebhookUrl}
                      className="text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 text-[11px]"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? 'Copied!' : 'Copy Webhook URL'}</span>
                    </Button>
                  </div>
                  <code className="block bg-slate-950 p-2.5 rounded-lg text-emerald-400 text-[11px] overflow-x-auto select-all">
                    {webhookPublicUrl}
                  </code>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-navy-900 text-xs">Recent Webhook Events ({webhookEvents.length})</span>
                  {webhookEvents.length === 0 ? (
                    <p className="text-content-muted py-4 text-center border border-dashed rounded-xl text-[11px]">
                      No webhook events logged yet. Once connected, incoming events from Meta will appear here.
                    </p>
                  ) : (
                    <div className="divide-y divide-surface-border border rounded-xl overflow-hidden">
                      {webhookEvents.map((evt) => (
                        <div key={evt.id} className="p-3 flex items-center justify-between gap-3 bg-white text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={evt.processing_status === 'received' ? 'blue' : 'neutral'} size="sm">
                                {evt.event_type.toUpperCase()}
                              </Badge>
                              <span className="font-mono text-[11px] text-content-secondary">
                                ID: {evt.provider_event_id || 'evt_none'}
                              </span>
                            </div>
                            <p className="text-[11px] text-content-muted mt-0.5">
                              {new Date(evt.received_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge variant={evt.processing_status === 'received' ? 'success' : 'neutral'}>
                            {evt.processing_status.toUpperCase()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: ATTENTION RULES */}
      {activeTab === 'attention' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <Card title="Deterministic Attention Rules" subtitle="Configure SLA thresholds for work queue prioritization">
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Hot Lead Inactivity Threshold (Hours)"
                  type="number"
                  value={hotInactivity}
                  onChange={(e) => setHotInactivity(e.target.value)}
                  disabled={!isOwnerOrManager}
                  leftIcon={<Clock className="w-4 h-4 text-content-muted" />}
                />

                <Input
                  label="New Lead Contact SLA (Hours)"
                  type="number"
                  value={contactThreshold}
                  onChange={(e) => setContactThreshold(e.target.value)}
                  disabled={!isOwnerOrManager}
                  leftIcon={<Clock className="w-4 h-4 text-content-muted" />}
                />
              </div>

              <Input
                label={`High Value Deal Threshold (${currency})`}
                type="number"
                placeholder="e.g. 50000"
                value={highValueThreshold}
                onChange={(e) => setHighValueThreshold(e.target.value)}
                disabled={!isOwnerOrManager}
                leftIcon={<Globe className="w-4 h-4 text-content-muted" />}
              />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" type="submit" isLoading={saving} icon={<Save className="w-4 h-4" />}>
              Save Attention Rules
            </Button>
          </div>
        </form>
      )}

      {/* TAB 4: NOTIFICATIONS & ALERTS */}
      {activeTab === 'notifications' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <Card title="Alert Preferences" subtitle="Customize operational email and in-app notifications">
            <div className="space-y-3 text-xs">
              {[
                { key: 'public_form_alerts', label: 'Public Form Submissions Alert', desc: 'Notify when a lead submits a public form' },
                { key: 'assignment_alerts', label: 'Lead Assignment Alerts', desc: 'Notify agents when a lead is assigned to them' },
                { key: 'followup_due_alerts', label: 'Scheduled Follow-up Reminders', desc: 'Remind when a scheduled follow-up is due' },
                { key: 'overdue_alerts', label: 'Overdue Task Notifications', desc: 'Notify when a task or lead SLA is breached' },
                { key: 'won_lost_alerts', label: 'Deal Won / Lost Notifications', desc: 'Notify team when a deal closes' },
                { key: 'daily_digest_enabled', label: 'Daily Operations Digest', desc: 'Send daily summary of work queue and pipeline' },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-3 p-3 bg-slate-50 border border-surface-border/60 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={Boolean(notifPrefs[item.key as keyof NotificationPreferences])}
                    onChange={(e) =>
                      setNotifPrefs({
                        ...notifPrefs,
                        [item.key]: e.target.checked,
                      })
                    }
                    className="mt-0.5 rounded border-surface-border text-brand-blue focus:ring-brand-blue"
                  />
                  <div>
                    <span className="font-bold text-navy-900 block">{item.label}</span>
                    <span className="text-[11px] text-content-secondary">{item.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" type="submit" isLoading={saving} icon={<Save className="w-4 h-4" />}>
              Save Notification Preferences
            </Button>
          </div>
        </form>
      )}

      {/* TAB 5: PLATFORM & PWA */}
      {activeTab === 'platform' && (
        <Card title="Platform Information & PWA Status" subtitle="System environment and Progressive Web App status">
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 border border-surface-border rounded-xl space-y-1">
                <span className="text-content-secondary text-[11px]">Platform Name</span>
                <span className="font-bold text-navy-900 block">Noverlyn Business Operations</span>
              </div>
              <div className="p-3 bg-slate-50 border border-surface-border rounded-xl space-y-1">
                <span className="text-content-secondary text-[11px]">Version</span>
                <span className="font-bold text-navy-900 block">v1.3.0 (Standalone PWA)</span>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="w-6 h-6 text-emerald-600" />
                <div>
                  <span className="font-bold text-navy-900 block">PWA Standalone Mode Supported</span>
                  <span className="text-[11px] text-content-secondary">Installed PWAs launch in portrait-primary mode with offline caching.</span>
                </div>
              </div>
              <Badge variant="success">READY</Badge>
            </div>
          </div>
        </Card>
      )}

      {/* MODALS */}
      <ConnectWhatsAppModal
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
        onSuccess={loadWhatsAppConnection}
      />

      <SendTestMessageModal
        isOpen={isTestMsgOpen}
        onClose={() => setIsTestMsgOpen(false)}
        phoneNumberId={waConn?.display_phone_number || waConn?.phone_number_id}
      />
    </div>
  )
}
