import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useWorkspace } from '../hooks/useWorkspace'
import { leadsApi, type ImportLeadItem, type ImportLeadsResult } from '../lib/leadsApi'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Users,
  Download
} from 'lucide-react'

import { getTemplateForBusinessType } from '../lib/templates'

type ImportStep = 'upload' | 'mapping' | 'preview' | 'result'

export const CsvImportPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeTemplate = getTemplateForBusinessType((currentWorkspace as unknown as { business_type?: string })?.business_type)

  const targetFields = [
    { key: 'full_name', label: 'Lead Name *', required: true },
    { key: 'phone', label: 'Phone Number', required: false },
    { key: 'email', label: 'Email Address', required: false },
    { key: 'source', label: 'Lead Source', required: false },
    { key: 'priority', label: 'Priority (hot/warm/cold)', required: false },
    { key: 'stage', label: 'Pipeline Stage', required: false },
    { key: 'budget_min', label: 'Min Budget', required: false },
    { key: 'budget_max', label: 'Max Budget', required: false },
    { key: 'estimated_value', label: 'Estimated Value', required: false },
    { key: 'requirement', label: activeTemplate.requirementLabel, required: false },
    { key: 'notes', label: 'Initial Note', required: false },
    { key: 'assigned_agent_email', label: 'Assigned Agent Email', required: false },
  ]

  const [step, setStep] = useState<ImportStep>('upload')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportLeadsResult | null>(null)

  // Parse CSV text helper
  const parseCsvText = (text: string) => {
    const lines = text.split(/\r\n|\n/).filter((l) => l.trim() !== '')
    if (lines.length < 2) {
      throw new Error('CSV file must contain a header row and at least one data row.')
    }

    const parseLine = (line: string) => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''))
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''))
      return result
    }

    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine)
    return { headers, rows }
  }

  // Canonical File Processing Handler
  const processFile = (file: File) => {
    setError(null)

    // Check size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('CSV file size exceeds 10MB limit.')
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string
        const { headers, rows } = parseCsvText(content)

        setCsvHeaders(headers)
        setCsvRows(rows)

        // Best effort auto-mapping
        const initialMap: Record<string, string> = {}
        targetFields.forEach((tf) => {
          const match = headers.find((h) => {
            const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '')
            const cleanF = tf.key.toLowerCase().replace(/[^a-z0-9]/g, '')
            return (
              cleanH.includes(cleanF) ||
              (tf.key === 'full_name' && (cleanH.includes('name') || cleanH.includes('customer')))
            )
          })
          if (match) {
            initialMap[tf.key] = match
          }
        })

        setColumnMap(initialMap)
        setStep('mapping')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not parse CSV file.')
      }
    }

    reader.readAsText(file)
  }

  // Handle File Input Change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
    // Reset input value so selecting same file again triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
        setError('Please drop a valid .csv file.')
        return
      }
      processFile(file)
    }
  }

  // Download Sample Template CSV
  const handleDownloadSample = () => {
    const sampleContent =
      'Lead Name,Phone,Email,Source,Priority,Stage,Min Budget,Max Budget,Estimated Value,Requirement,Notes,Assigned Agent Email\n' +
      'Sarah Jenkins,+14155550192,sarah.j@example.com,Website,hot,new,400000,600000,550000,Looking for 3BHK penthouse in Downtown,First inquiry from contact form,\n' +
      'Michael Chen,+14155550144,m.chen@example.com,Referral,warm,contacted,250000,350000,300000,Interested in suburban villa,Called on Monday morning,\n'

    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'noverlyn_lead_import_sample.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Construct Mapped Leads for Preview & Import
  const getMappedLeads = (): ImportLeadItem[] => {
    const nameColIndex = csvHeaders.indexOf(columnMap['full_name'] || '')
    if (nameColIndex === -1) return []

    return csvRows
      .map((row) => {
        const getVal = (fieldKey: string) => {
          const colName = columnMap[fieldKey]
          if (!colName) return undefined
          const idx = csvHeaders.indexOf(colName)
          return idx !== -1 ? row[idx]?.trim() : undefined
        }

        const fullName = getVal('full_name')
        if (!fullName) return null

        const parseNum = (v?: string) => (v && !isNaN(Number(v)) ? Number(v) : undefined)

        return {
          full_name: fullName,
          phone: getVal('phone'),
          email: getVal('email'),
          source: getVal('source'),
          priority: getVal('priority')?.toLowerCase(),
          stage: getVal('stage')?.toLowerCase(),
          budget_min: parseNum(getVal('budget_min')),
          budget_max: parseNum(getVal('budget_max')),
          estimated_value: parseNum(getVal('estimated_value')),
          requirement: getVal('requirement'),
          notes: getVal('notes'),
          assigned_agent_email: getVal('assigned_agent_email'),
        } as ImportLeadItem
      })
      .filter((item): item is ImportLeadItem => item !== null)
  }

  const mappedLeads = getMappedLeads()

  const handleExecuteImport = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    setError(null)

    try {
      const res = await leadsApi.importLeads(currentWorkspace.id, mappedLeads, skipDuplicates)
      setResult(res)
      setStep('result')
    } catch (err: unknown) {
      console.error('[CSV Import Error]', err)
      setError(err instanceof Error ? err.message : 'CSV Lead Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl text-navy-900">CSV Lead Import</h1>
            <Badge variant="blue">Bulk Import Tool</Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Import client leads from spreadsheets directly into <span className="font-semibold text-navy-900">{currentWorkspace?.name}</span>
          </p>
        </div>

        <Button variant="outline" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/leads')}>
          Back to All Leads
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Import Error</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* STEP 1: UPLOAD */}
      {step === 'upload' && (
        <Card title="Step 1: Upload CSV File" subtitle="Select a CSV spreadsheet file containing your real estate leads">
          <div className="space-y-6 py-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-brand-blue bg-blue-50/50 shadow-md'
                  : 'border-slate-300 hover:border-brand-blue bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <UploadCloud className="w-12 h-12 text-brand-blue mx-auto mb-3" />
              <h3 className="font-heading font-bold text-sm text-navy-900">
                {isDragging ? 'Drop CSV File Here' : 'Upload or Drag & Drop your CSV file'}
              </h3>
              <p className="text-xs text-content-secondary mt-1 mb-4">
                Supports UTF-8 encoded .csv files with column headers up to 10MB.
              </p>
              <div>
                <Button
                  type="button"
                  variant="primary"
                  icon={<FileSpreadsheet className="w-4 h-4" />}
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  Browse CSV File
                </Button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-surface-border rounded-xl flex items-center justify-between gap-4">
              <div>
                <span className="font-bold text-xs text-navy-900 block">Need a sample template?</span>
                <span className="text-[11px] text-content-secondary">Download our formatted CSV sample to see recommended columns.</span>
              </div>
              <Button type="button" variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleDownloadSample}>
                Download Template
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: MAPPING */}
      {step === 'mapping' && (
        <Card title="Step 2: Map CSV Columns" subtitle={`Map your CSV columns to Noverlyn lead fields (${csvRows.length} rows found)`}>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {targetFields.map((field) => (
                <div key={field.key} className="p-3 border border-surface-border rounded-lg bg-slate-50/50 space-y-1.5">
                  <label className="text-xs font-semibold text-navy-900 block">
                    {field.label}
                  </label>
                  <select
                    value={columnMap[field.key] || ''}
                    onChange={(e) => setColumnMap({ ...columnMap, [field.key]: e.target.value })}
                    className="w-full bg-white border border-surface-border rounded-lg px-3 py-1.5 text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  >
                    <option value="">-- Do Not Import --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between border-t border-surface-border">
              <Button type="button" variant="outline" onClick={() => setStep('upload')}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!columnMap['full_name']}
                icon={<ArrowRight className="w-4 h-4" />}
                onClick={() => setStep('preview')}
              >
                Continue to Preview ({mappedLeads.length} Valid Leads)
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3: PREVIEW */}
      {step === 'preview' && (
        <Card title="Step 3: Preview & Confirm Import" subtitle={`Review ${mappedLeads.length} leads ready for import into ${currentWorkspace?.name}`}>
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-3 bg-brand-blue-light border border-blue-200 rounded-lg text-xs text-navy-900">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />
                <span>Skip duplicate leads automatically (matches phone or email in active workspace)</span>
              </label>
            </div>

            <div className="border border-surface-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 border-b border-surface-border font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Lead Name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {mappedLeads.slice(0, 15).map((l, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-navy-900">{l.full_name}</td>
                      <td className="p-3 text-content-secondary">{l.phone || '—'}</td>
                      <td className="p-3 text-content-secondary">{l.email || '—'}</td>
                      <td className="p-3"><Badge variant="blue">{l.source || 'csv_import'}</Badge></td>
                      <td className="p-3"><Badge variant={l.priority === 'hot' ? 'critical' : 'warning'}>{l.priority || 'warm'}</Badge></td>
                      <td className="p-3 text-content-secondary uppercase">{l.stage || 'new'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mappedLeads.length > 15 && (
                <div className="p-2.5 bg-slate-50 text-center text-xs text-content-muted border-t border-surface-border">
                  Showing first 15 of {mappedLeads.length} leads...
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-between border-t border-surface-border">
              <Button type="button" variant="outline" onClick={() => setStep('mapping')}>
                Back to Mapping
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={loading}
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={handleExecuteImport}
              >
                Import {mappedLeads.length} Leads Now
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 4: RESULT */}
      {step === 'result' && result && (
        <Card title="Import Completed" subtitle="CSV lead batch import summary">
          <div className="space-y-6 text-center py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <span className="font-heading font-extrabold text-3xl text-emerald-700 block">{result.imported}</span>
                <span className="text-xs font-bold text-emerald-900">Leads Imported</span>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <span className="font-heading font-extrabold text-3xl text-amber-700 block">{result.skipped}</span>
                <span className="text-xs font-bold text-amber-900">Duplicates Skipped</span>
              </div>
              <div className="p-4 bg-slate-50 border border-surface-border rounded-xl text-center">
                <span className="font-heading font-extrabold text-3xl text-slate-700 block">{result.failed}</span>
                <span className="text-xs font-bold text-navy-900">Failed / Invalid</span>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="p-4 bg-status-critical-bg border border-red-200 rounded-xl text-left space-y-2">
                <strong className="text-xs font-bold text-status-critical block">Row Failure Details:</strong>
                <div className="max-h-40 overflow-y-auto divide-y divide-red-200 text-xs">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between gap-4">
                      <span>Row {err.row}: <strong className="text-navy-900">{err.name}</strong></span>
                      <span className="text-status-critical">{err.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
              <Button type="button" variant="outline" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => setStep('upload')}>
                Import Another CSV
              </Button>
              <Button type="button" variant="primary" icon={<Users className="w-4 h-4" />} onClick={() => navigate('/leads')}>
                View Imported Leads
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
