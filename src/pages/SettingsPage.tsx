import React, { useState, useEffect } from 'react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { useWorkspace } from '../hooks/useWorkspace'
import { supabase } from '../lib/supabase'
import { leadsApi } from '../lib/leadsApi'
import { getTemplateForBusinessType } from '../lib/templates'
import { APP_CONFIG } from '../lib/config'
import type { Database } from '../types/database.types'
import { Sliders, Clock, Globe, Save, CheckCircle2, AlertCircle } from 'lucide-react'

export const SettingsPage: React.FC = () => {
  const { currentWorkspace, currentRole, reloadWorkspaces } = useWorkspace()

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [currency, setCurrency] = useState('USD')

  // Operational thresholds
  const [hotInactivity, setHotInactivity] = useState('48')
  const [contactThreshold, setContactThreshold] = useState('4')
  const [highValueThreshold, setHighValueThreshold] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager'

  useEffect(() => {
    if (currentWorkspace) {
      Promise.resolve().then(() => {
        setName(currentWorkspace.name || '')
        setTimezone(currentWorkspace.timezone || 'UTC')
        setCurrency(currentWorkspace.currency || 'USD')
      })

      // Fetch workspace settings
      if (supabase) {
        Promise.resolve().then(async () => {
          setLoading(true)
          const { data, error: err } = await supabase!
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', currentWorkspace.id)
            .single()

          if (!err && data) {
            const ws = data as Database['public']['Tables']['workspace_settings']['Row']
            setHotInactivity(String(ws.hot_lead_inactivity_hours || 48))
            setContactThreshold(String(ws.new_lead_contact_threshold_hours || 4))
            setHighValueThreshold(ws.high_value_threshold ? String(ws.high_value_threshold) : '')
          }
          setLoading(false)
        })
      }
    }
  }, [currentWorkspace])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace) return
    if (!isOwnerOrManager) {
      setError('Only workspace owners and managers can update settings.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      await leadsApi.updateWorkspaceSettings(
        currentWorkspace.id,
        name.trim(),
        timezone,
        currency,
        Number(hotInactivity) || 48,
        Number(contactThreshold) || 4,
        highValueThreshold ? Number(highValueThreshold) : null
      )

      setSuccessMsg('Workspace settings saved successfully!')
      await reloadWorkspaces()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save settings'
      setError(errorMsg)
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
    { value: 'CAD', label: 'CAD ($) - Canadian Dollar' },
    { value: 'AUD', label: 'AUD ($) - Australian Dollar' },
    { value: 'SGD', label: 'SGD ($) - Singapore Dollar' },
  ]

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-surface-border">
        <h1 className="font-heading font-bold text-2xl text-navy-900">Workspace Settings</h1>
        <p className="text-xs text-content-secondary mt-1">
          Configure identity, operating thresholds, and high-value deal scoring for <span className="font-semibold text-navy-900">{currentWorkspace?.name}</span>.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-status-success-bg border border-emerald-200 rounded-lg text-xs text-status-success flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Workspace Identity */}
          <Card title="Workspace Profile" subtitle="Company name, unique slug, and regional defaults">
            <div className="space-y-4">
              <Input
                label="Workspace Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwnerOrManager}
                required
              />

              <Input
                label="Workspace Slug (Read Only)"
                value={currentWorkspace?.slug || ''}
                readOnly
                disabled
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Business Timezone"
                  options={timezoneOptions}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!isOwnerOrManager}
                />

                <Select
                  label="Primary Currency"
                  options={currencyOptions}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={!isOwnerOrManager}
                />
              </div>

              <div className="pt-2 flex justify-between text-xs text-content-secondary">
                <span>Your Role: <strong className="uppercase text-navy-900">{currentRole}</strong></span>
                <span>Owner ID: <span className="font-mono">{currentWorkspace?.owner_user_id.slice(0, 8)}...</span></span>
              </div>
            </div>
          </Card>

          {/* Operational Thresholds */}
          <Card title="Lead Operational Rules" subtitle="Inactivity hours, contact thresholds, and deal thresholds">
            <div className="space-y-4 text-xs">
              <Input
                label="Hot Lead Inactivity Threshold (Hours)"
                type="number"
                value={hotInactivity}
                onChange={(e) => setHotInactivity(e.target.value)}
                leftIcon={<Clock className="w-4 h-4 text-brand-blue" />}
                disabled={!isOwnerOrManager}
                helperText="Flags hot leads with no activity recorded past this hour threshold."
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

        {isOwnerOrManager && (
          <div className="flex justify-end pt-4 border-t border-surface-border">
            <Button variant="primary" type="submit" isLoading={saving || loading} icon={<Save className="w-4 h-4" />}>
              Save Workspace Settings
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
