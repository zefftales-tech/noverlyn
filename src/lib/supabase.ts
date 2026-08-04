import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
)

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : (null as unknown as ReturnType<typeof createClient<Database>>)

export async function getValidAccessToken(): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  // 1. Retrieve current session
  const { data: { session }, error: sessionErr } = await supabase.auth.getSession()

  if (sessionErr || !session?.access_token) {
    console.warn('[getValidAccessToken] Session missing or error:', sessionErr)
    throw new Error('SESSION_EXPIRED')
  }

  // 2. Check token expiry timestamp (refresh if expiring within 60 seconds)
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
  const now = Date.now()

  let currentToken = session.access_token

  if (expiresAt > 0 && expiresAt - now < 60000) {
    if (import.meta.env.DEV) {
      console.log('[getValidAccessToken] Token close to expiry, refreshing session...', {
        expiresAt: new Date(expiresAt).toISOString(),
      })
    }

    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr || !refreshData.session?.access_token) {
      console.error('[getValidAccessToken] Session refresh failed:', refreshErr)
      throw new Error('SESSION_EXPIRED')
    }
    currentToken = refreshData.session.access_token
  }

  // Diagnostic logging (Never log token value!)
  if (import.meta.env.DEV) {
    console.log('[getValidAccessToken] Valid access token retrieved', {
      sessionExists: true,
      hasAccessToken: Boolean(currentToken),
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    })
  }

  return currentToken
}
