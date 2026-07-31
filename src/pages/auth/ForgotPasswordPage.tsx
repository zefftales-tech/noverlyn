import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'

export const ForgotPasswordPage: React.FC = () => {
  const { resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    const { error: err } = await resetPassword(email.trim())
    setLoading(false)

    if (err) {
      setError(err.message)
    } else {
      setSuccessMsg('Password reset instructions sent! Please check your inbox.')
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will send a password reset link to your work email address"
    >
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Work Email Address"
          type="email"
          placeholder="agent@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
          required
          autoComplete="email"
        />

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={loading}
        >
          Send Reset Instructions
        </Button>
      </form>

      <div className="pt-4 border-t border-surface-border text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs text-content-secondary hover:text-navy-900 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
