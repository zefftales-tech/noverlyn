import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Mail, Lock, AlertCircle } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)
    setError(null)

    const { error: err } = await signIn(email.trim(), password)
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <AuthLayout
      title="Sign in to your account"
      subtitle="Access your workspace operations and active pipeline"
    >
      {error && (
        <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
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

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span />
            <Link
              to="/forgot-password"
              className="text-xs text-brand-blue font-medium hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
            required
            autoComplete="current-password"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={loading}
        >
          Sign In
        </Button>
      </form>

      <div className="pt-4 border-t border-surface-border text-center">
        <p className="text-xs text-content-secondary">
          Don't have an account yet?{' '}
          <Link to="/signup" className="text-brand-blue font-semibold hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
