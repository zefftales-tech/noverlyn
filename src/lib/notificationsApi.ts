import { supabase } from './supabase'

export interface AppNotification {
  id: string
  workspace_id: string
  user_id: string
  type: string
  title: string
  message: string
  entity_type?: string | null
  entity_id?: string | null
  metadata: Record<string, unknown>
  is_read: boolean
  created_at: string
  read_at?: string | null
}

export interface NotificationPreferences {
  user_id: string
  workspace_id: string
  public_form_alerts: boolean
  assignment_alerts: boolean
  followup_due_alerts: boolean
  overdue_alerts: boolean
  won_lost_alerts: boolean
  daily_digest_enabled: boolean
}

async function callRpc<T>(fnName: string, params: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase client uninitialized')
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>)(fnName, params)

  if (error) throw error
  return data as T
}

export const notificationsApi = {
  // Fetch user notifications for current workspace
  getNotifications: async (workspaceId: string, limit = 50): Promise<AppNotification[]> => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching notifications:', error)
      return []
    }
    return (data as unknown) as AppNotification[]
  },

  // Mark single notification as read
  markAsRead: async (notificationId: string): Promise<boolean> => {
    if (!supabase) return false
    const { error } = await supabase
      .from('notifications' as never)
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .eq('id', notificationId)

    if (error) {
      console.error('Error marking notification as read:', error)
      return false
    }
    return true
  },

  // Mark all notifications for user as read
  markAllAsRead: async (workspaceId: string, userId: string): Promise<boolean> => {
    if (!supabase) return false
    const { error } = await supabase
      .from('notifications' as never)
      .update({ is_read: true, read_at: new Date().toISOString() } as never)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      console.error('Error marking all notifications as read:', error)
      return false
    }
    return true
  },

  // Fetch notification preferences
  getPreferences: async (workspaceId: string, userId: string): Promise<NotificationPreferences | null> => {
    try {
      const data = await callRpc<NotificationPreferences[]>('get_or_seed_notification_preferences', {
        p_user_id: userId,
        p_workspace_id: workspaceId,
      })
      return data?.[0] || null
    } catch (err) {
      console.error('Error fetching notification preferences:', err)
      return null
    }
  },

  // Update notification preferences via secure RPC
  updatePreferences: async (prefs: NotificationPreferences): Promise<boolean> => {
    try {
      await callRpc('save_notification_preferences_rpc', {
        p_workspace_id: prefs.workspace_id,
        p_public_form_alerts: prefs.public_form_alerts,
        p_assignment_alerts: prefs.assignment_alerts,
        p_followup_due_alerts: prefs.followup_due_alerts,
        p_overdue_alerts: prefs.overdue_alerts,
        p_won_lost_alerts: prefs.won_lost_alerts,
        p_daily_digest_enabled: prefs.daily_digest_enabled,
      })
      return true
    } catch (err) {
      console.error('Error saving notification preferences:', err)
      return false
    }
  },

  // Trigger follow-up due/overdue generator
  generateReminders: async (workspaceId: string): Promise<number> => {
    try {
      return await callRpc<number>('generate_due_and_overdue_notifications', {
        p_workspace_id: workspaceId,
      })
    } catch (err) {
      console.error('Error generating due/overdue notifications:', err)
      return 0
    }
  },
}
