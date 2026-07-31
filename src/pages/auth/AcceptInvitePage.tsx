import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/LoadingState'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { teamApi, type InvitationStatusInfo } from '../../lib/teamApi'
import { supabase } from '../../lib/supabase'
import { useWorkspace } from '../../hooks/useWorkspace'
import { ShieldCheck, AlertCircle, ArrowRight, UserCheck, CheckCircle2 } from 'lucide-react'

export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { reloadWorkspaces } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<InvitationStatusInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isSubscribed = true

    const validateTokenStatus = async () => {
      const startTime = performance.now()

      if (!token) {
        if (isSubscribed) {
          setTokenInfo({ status: 'invalid' })
          setLoading(false)
        }
        return
      }

      // 1. Fast lightweight RPC call (unauthenticated friendly)
      try {
        const info = await teamApi.getInvitationStatus(token)
        const duration = (performance.now() - startTime).toFixed(1)
        console.log(`[Perf Log] Token status resolved in ${duration}ms:`, info.status)

        if (isSubscribed) {
          setTokenInfo(info)
        }
      } catch (err) {
        console.error('[Error fetching token status]', err)
        if (isSubscribed) {
          setTokenInfo({ status: 'invalid' })
        }
      }

      // 2. Check auth session
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession()
        if (isSubscribed) {
          setIsAuthenticated(Boolean(sessionData?.session))
        }
      }

      if (isSubscribed) {
        setLoading(false)
      }
    }

    validateTokenStatus()

    return () => {
      isSubscribed = false
    }
  }, [token])

  const handleAccept = async () => {
    if (!token) return
    setAccepting(true)
    setError(null)

    try {
      const workspaceId = await teamApi.acceptInvitation(token)
      if (workspaceId) {
        localStorage.setItem('noverlyn_active_workspace_id', workspaceId)
        await reloadWorkspaces()
      }
      navigate('/', { replace: true })
    } catch (err: unknown) {
      console.error('[Accept error]', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to accept invitation'
      setError(errorMsg)
      setAccepting(false)
    }
  }

  return (
    <AuthLayout title="Workspace Invitation" subtitle="Join Noverlyn Real Estate team workspace">
      <Card title="Workspace Invitation" subtitle={tokenInfo?.workspace_name ? `Invitation to ${tokenInfo.workspace_name}` : 'Invitation Status'}>
        {loading ? (
          <LoadingState label="Checking invitation token status..." />
        ) : tokenInfo?.status === 'invalid' ? (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2 text-left">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Invalid Invitation Link</strong>
                <span>This invitation link is invalid or malformed.</span>
              </div>
            </div>
            <Button variant="outline" icon={<ArrowRight className="w-4 h-4" />} onClick={() => navigate('/')}>
              Go to Dashboard
            </Button>
          </div>
        ) : tokenInfo?.status === 'revoked' ? (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2 text-left">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Invitation Revoked</strong>
                <span>This invitation is no longer valid. The workspace owner has revoked this link.</span>
              </div>
            </div>
            <Button variant="outline" icon={<ArrowRight className="w-4 h-4" />} onClick={() => navigate('/')}>
              Go to Dashboard
            </Button>
          </div>
        ) : tokenInfo?.status === 'expired' ? (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-status-warning-bg border border-amber-200 rounded-lg text-xs text-status-warning flex items-start gap-2 text-left">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Invitation Expired</strong>
                <span>This invitation link has expired. Ask the workspace owner for a new invitation link.</span>
              </div>
            </div>
            <Button variant="outline" icon={<ArrowRight className="w-4 h-4" />} onClick={() => navigate('/')}>
              Go to Dashboard
            </Button>
          </div>
        ) : tokenInfo?.status === 'accepted' ? (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-bold">This invitation has already been accepted.</span>
            </div>
            <Button
              variant="primary"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => {
                if (tokenInfo.workspace_id) {
                  localStorage.setItem('noverlyn_active_workspace_id', tokenInfo.workspace_id)
                }
                navigate('/')
              }}
            >
              Go to Workspace
            </Button>
          </div>
        ) : tokenInfo?.status === 'valid' ? (
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-status-critical-bg border border-red-200 rounded-lg text-xs text-status-critical flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-4 bg-slate-50 border border-surface-border rounded-xl space-y-2 text-xs">
              <div className="flex justify-between border-b border-surface-border pb-2">
                <span className="text-content-secondary">Target Workspace:</span>
                <span className="font-bold text-navy-900">{tokenInfo.workspace_name}</span>
              </div>
              <div className="flex justify-between border-b border-surface-border pb-2">
                <span className="text-content-secondary">Invited Email:</span>
                <span className="font-semibold text-navy-900">{tokenInfo.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-content-secondary">Assigned Role:</span>
                <span className="font-bold text-navy-900 uppercase">{tokenInfo.role}</span>
              </div>
            </div>

            {!isAuthenticated ? (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-brand-blue-light border border-blue-200 rounded-lg text-xs text-navy-900">
                  <ShieldCheck className="w-4 h-4 text-brand-blue inline mr-1" />
                  <span>Please sign in with <strong className="text-navy-900">{tokenInfo.email}</strong> to accept this invitation.</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="primary" onClick={() => navigate('/login')}>
                    Sign In to Accept
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/signup')}>
                    Create New Account
                  </Button>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <Button
                  variant="primary"
                  className="w-full"
                  isLoading={accepting}
                  icon={<UserCheck className="w-4 h-4" />}
                  onClick={handleAccept}
                >
                  Accept & Enter Workspace
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </AuthLayout>
  )
}
