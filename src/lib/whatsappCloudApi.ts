import { supabase, isSupabaseConfigured, getValidAccessToken } from './supabase'

export interface WhatsAppConnection {
  id: string
  workspace_id: string
  provider: string
  status: 'disconnected' | 'connecting' | 'connected' | 'action_required' | 'error'
  meta_business_id: string | null
  whatsapp_business_account_id: string | null
  phone_number_id: string | null
  display_phone_number: string | null
  verified_name: string | null
  quality_rating: string | null
  messaging_limit_tier: string | null
  token_reference: string | null
  token_expires_at: string | null
  connected_by: string | null
  connected_at: string | null
  disconnected_at: string | null
  last_verified_at: string | null
  last_webhook_at: string | null
  last_error: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface WebhookEvent {
  id: string
  workspace_id: string | null
  connection_id: string | null
  provider_event_id: string | null
  event_type: string
  payload: Record<string, unknown>
  processing_status: 'received' | 'processed' | 'ignored' | 'failed'
  processing_error: string | null
  received_at: string
}

export interface ConnectParams {
  workspace_id: string
  waba_id: string
  phone_number_id: string
  access_token: string
  meta_business_id?: string
}

export interface TestMessageParams {
  workspace_id: string
  recipient_phone: string
  template_name?: string
  language_code?: string
}

export interface WhatsAppApiError extends Error {
  meta_status?: number
  meta_code?: number
  meta_subcode?: number
  meta_message?: string
  meta_user_message?: string
  trace_id?: string
}

async function invokeEdgeFunction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  let token: string
  try {
    token = await getValidAccessToken()
  } catch {
    const err: WhatsAppApiError = new Error('Your session has expired. Please sign in again.')
    err.meta_user_message = 'Your session has expired. Please sign in again.'
    throw err
  }

  if (import.meta.env.DEV) {
    console.log('[whatsappCloudApi] Invoking whatsapp-connection-manage', {
      action,
      hasToken: Boolean(token),
    })
  }

  // Invoke Edge Function with explicit Bearer access token
  const { data, error } = await supabase.functions.invoke('whatsapp-connection-manage', {
    body: { action, ...payload },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (error) {
    console.warn(`[Edge Function ${action} returned non-2xx status]`, error)

    let serverBody: Record<string, unknown> | null = null
    const errorWithContext = error as unknown as { context?: Response }

    if (errorWithContext?.context && typeof errorWithContext.context.json === 'function') {
      try {
        serverBody = await errorWithContext.context.json()
      } catch {
        // Body was not JSON
      }
    }

    if (serverBody) {
      const displayMsg =
        (serverBody.message as string) ||
        (serverBody.error as string) ||
        (serverBody.meta_user_message as string) ||
        (serverBody.meta_message as string) ||
        error.message

      const apiErr: WhatsAppApiError = new Error(displayMsg)
      apiErr.meta_status = serverBody.meta_status as number | undefined
      apiErr.meta_code = serverBody.meta_code as number | undefined
      apiErr.meta_subcode = serverBody.meta_subcode as number | undefined
      apiErr.meta_message = serverBody.meta_message as string | undefined
      apiErr.meta_user_message = (serverBody.meta_user_message || displayMsg) as string
      apiErr.trace_id = serverBody.trace_id as string | undefined
      throw apiErr
    }

    // Fallback for direct RPC execution if Edge Functions are not deployed yet
    if (action === 'connect') {
      const rpcRes = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)('save_whatsapp_connection_credentials_rpc', {
        p_workspace_id: payload.workspace_id,
        p_waba_id: payload.waba_id,
        p_phone_number_id: payload.phone_number_id,
        p_access_token: payload.access_token,
        p_meta_business_id: payload.meta_business_id || null,
        p_display_phone: null,
        p_verified_name: 'Verified Business',
      })
      if (rpcRes.error) throw new Error(rpcRes.error.message)
      return rpcRes.data as T
    }

    if (action === 'disconnect') {
      const rpcRes = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)('disconnect_whatsapp_connection_rpc', {
        p_workspace_id: payload.workspace_id,
      })
      if (rpcRes.error) throw new Error(rpcRes.error.message)
      return rpcRes.data as T
    }

    throw new Error(error.message || `Edge function ${action} failed`)
  }

  return data as T
}

export const whatsappCloudApi = {
  // 1. Fetch Connection Status for a Workspace
  getConnection: async (workspaceId: string): Promise<WhatsAppConnection | null> => {
    if (!isSupabaseConfigured || !supabase) return null

    const { data, error } = await supabase
      .from('whatsapp_connections' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('[whatsappCloudApi.getConnection failed]', error)
      throw error
    }

    return (data as unknown as WhatsAppConnection) || null
  },

  // 2. Connect WhatsApp Cloud API
  connect: async (params: ConnectParams): Promise<{ success: boolean; connection_id: string; status: string }> => {
    return invokeEdgeFunction<{ success: boolean; connection_id: string; status: string }>('connect', {
      workspace_id: params.workspace_id,
      waba_id: params.waba_id,
      phone_number_id: params.phone_number_id,
      access_token: params.access_token,
      meta_business_id: params.meta_business_id,
    })
  },

  // 3. Verify WhatsApp Connection
  verify: async (workspaceId: string): Promise<{ success: boolean; status: string }> => {
    return invokeEdgeFunction<{ success: boolean; status: string }>('verify', {
      workspace_id: workspaceId,
    })
  },

  // 4. Disconnect WhatsApp Cloud API
  disconnect: async (workspaceId: string): Promise<{ success: boolean; status: string }> => {
    return invokeEdgeFunction<{ success: boolean; status: string }>('disconnect', {
      workspace_id: workspaceId,
    })
  },

  // 5. Send Test Message via Cloud API
  sendTestMessage: async (params: TestMessageParams): Promise<{ success: boolean; message_id: string }> => {
    return invokeEdgeFunction<{ success: boolean; message_id: string }>('test-message', {
      workspace_id: params.workspace_id,
      recipient_phone: params.recipient_phone,
      template_name: params.template_name || 'hello_world',
      language_code: params.language_code || 'en_US',
    })
  },

  // 6. Fetch Webhook Diagnostics for Owner/Manager
  getWebhookEvents: async (workspaceId: string): Promise<WebhookEvent[]> => {
    if (!isSupabaseConfigured || !supabase) return []

    const { data, error } = await supabase
      .from('whatsapp_webhook_events' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('received_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[whatsappCloudApi.getWebhookEvents failed]', error)
      return []
    }

    return (data || []) as unknown as WebhookEvent[]
  },
}
