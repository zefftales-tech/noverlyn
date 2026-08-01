import React, { createContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Database, WorkspaceRole } from '../types/database.types'

type Workspace = Database['public']['Tables']['workspaces']['Row']

interface WorkspaceWithRole {
  workspace: Workspace
  role: WorkspaceRole
}

export interface WorkspaceContextType {
  currentWorkspace: Workspace | null
  currentRole: WorkspaceRole | null
  workspaces: WorkspaceWithRole[]
  loading: boolean
  needsOnboarding: boolean
  error: string | null
  switchWorkspace: (workspaceId: string) => void
  createWorkspace: (
    name: string,
    slug: string,
    timezone?: string,
    currency?: string,
    businessType?: string
  ) => Promise<{ workspaceId?: string; error: Error | null }>
  reloadWorkspaces: () => Promise<void>
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

const ACTIVE_WORKSPACE_STORAGE_KEY = 'noverlyn_active_workspace_id'

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [currentRole, setCurrentRole] = useState<WorkspaceRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWorkspaces = useCallback(async () => {
    if (!user || !isSupabaseConfigured || !supabase) {
      setWorkspaces([])
      setCurrentWorkspace(null)
      setCurrentRole(null)
      setLoading(false)
      return
    }

    try {
      // 1. Fetch active workspace memberships for the authenticated user
      const { data, error: memsErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, status')
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (memsErr) {
        console.error('[Supabase Error in loadWorkspaces (workspace_members)]', {
          message: memsErr.message,
          details: memsErr.details,
          hint: memsErr.hint,
          code: memsErr.code,
        })
        throw memsErr
      }

      const memsData = (data || []) as Array<{ workspace_id: string; role: WorkspaceRole; status: string }>

      if (memsData.length === 0) {
        setWorkspaces([])
        setCurrentWorkspace(null)
        setCurrentRole(null)
        localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
        setError(null)
        setLoading(false)
        return
      }

      const workspaceIds = memsData.map((m) => m.workspace_id)

      // 2. Fetch workspace details separately to avoid embedded relation failures
      const { data: wsData, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .in('id', workspaceIds)

      if (wsErr) {
        console.error('[Supabase Error in loadWorkspaces (workspaces)]', {
          message: wsErr.message,
          details: wsErr.details,
          hint: wsErr.hint,
          code: wsErr.code,
        })
        throw wsErr
      }

      const wsList = (wsData || []) as Workspace[]
      const wsMap = new Map(wsList.map((w) => [w.id, w]))
      const loadedWorkspaces: WorkspaceWithRole[] = memsData
        .filter((m) => wsMap.has(m.workspace_id))
        .map((m) => ({
          workspace: wsMap.get(m.workspace_id)!,
          role: m.role,
        }))

      setWorkspaces(loadedWorkspaces)
      setError(null)

      // 3. Determine active workspace & revalidate against active memberships
      const savedId = localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
      const matched = loadedWorkspaces.find((w) => w.workspace.id === savedId)

      if (matched) {
        setCurrentWorkspace(matched.workspace)
        setCurrentRole(matched.role)
      } else if (loadedWorkspaces.length > 0) {
        setCurrentWorkspace(loadedWorkspaces[0].workspace)
        setCurrentRole(loadedWorkspaces[0].role)
        localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, loadedWorkspaces[0].workspace.id)
      } else {
        setCurrentWorkspace(null)
        setCurrentRole(null)
        localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load workspace data'
      console.error('[WorkspaceContext loadWorkspaces failed]', err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let isSubscribed = true

    const runEffect = async () => {
      if (user && isSupabaseConfigured && supabase) {
        await loadWorkspaces()
      } else {
        if (!isSubscribed) return
        setWorkspaces([])
        setCurrentWorkspace(null)
        setCurrentRole(null)
        setLoading(false)
      }
    }

    runEffect()

    return () => {
      isSubscribed = false
    }
  }, [user, loadWorkspaces])

  const switchWorkspace = (workspaceId: string) => {
    const found = workspaces.find((w) => w.workspace.id === workspaceId)
    if (found) {
      setCurrentWorkspace(found.workspace)
      setCurrentRole(found.role)
      localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, found.workspace.id)
    }
  }

  const createWorkspace = async (
    name: string,
    slug: string,
    timezone: string = 'UTC',
    currency: string = 'USD',
    businessType: string = 'real_estate'
  ) => {
    if (!isSupabaseConfigured || !supabase) {
      return { error: new Error('Supabase is not configured') }
    }

    try {
      const { data, error: rpcErr } = await (supabase.rpc as unknown as (
        fnName: string,
        params: { p_name: string; p_slug: string; p_timezone: string; p_currency: string; p_business_type: string }
      ) => Promise<{ data: unknown; error: Error | null }>)('create_workspace', {
        p_name: name,
        p_slug: slug,
        p_timezone: timezone,
        p_currency: currency,
        p_business_type: businessType,
      })

      if (rpcErr) throw rpcErr

      const created = data as { id: string }
      if (created && created.id) {
        localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, created.id)
        await loadWorkspaces()
        return { workspaceId: created.id, error: null }
      }

      throw new Error('Workspace creation returned an invalid payload')
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error('Workspace creation failed')
      console.error('[Error creating workspace]', err)
      return { error: errObj }
    }
  }

  const needsOnboarding = !loading && workspaces.length === 0

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        currentRole,
        workspaces,
        loading,
        needsOnboarding,
        error,
        switchWorkspace,
        createWorkspace,
        reloadWorkspaces: loadWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
