import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg p-4">
      <div className="w-full max-w-md">
        <Card>
          <EmptyState
            title="404 — Page Not Found"
            description="The page or resource you requested could not be found."
            icon={<FileQuestion className="w-10 h-10 text-brand-blue" />}
            action={
              <Button variant="primary" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/')}>
                Return to Dashboard
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  )
}
