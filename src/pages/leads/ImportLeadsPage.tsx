import React from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Upload } from 'lucide-react'

export const ImportLeadsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-surface-border">
        <h1 className="font-heading font-bold text-2xl text-navy-900">Import Leads</h1>
        <p className="text-xs text-content-secondary mt-1">
          Bulk import property inquiries and client contacts from CSV spreadsheets into your workspace.
        </p>
      </div>

      <Card>
        <EmptyState
          title="CSV Import Engine"
          description="Batch CSV parsing, column mapping, and deduplication execution will be enabled in Phase 2."
          icon={<Upload className="w-10 h-10 text-brand-blue" />}
        />
      </Card>
    </div>
  )
}
