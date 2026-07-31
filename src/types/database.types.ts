export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type WorkspaceRole = 'owner' | 'manager' | 'agent'
export type MemberStatus = 'invited' | 'active' | 'disabled' | 'removed'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'property_shared' | 'viewing_scheduled' | 'negotiation' | 'won' | 'lost'
export type LeadPriority = 'hot' | 'warm' | 'cold'
export type LeadStatus = 'active' | 'won' | 'lost' | 'archived'
export type LostReason = 'price' | 'no_response' | 'bought_elsewhere' | 'location' | 'financing' | 'not_ready' | 'other'
export type FollowUpStatus = 'scheduled' | 'due' | 'overdue' | 'completed' | 'cancelled'
export type FollowUpType = 'call' | 'whatsapp' | 'email' | 'meeting' | 'viewing' | 'other'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          avatar_url?: string | null
          updated_at?: string
        }
      }
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          owner_user_id: string
          timezone: string
          currency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_user_id: string
          timezone?: string
          currency?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          timezone?: string
          currency?: string
          updated_at?: string
        }
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: WorkspaceRole
          status: MemberStatus
          joined_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role: WorkspaceRole
          status?: MemberStatus
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          role?: WorkspaceRole
          status?: MemberStatus
          joined_at?: string | null
          updated_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          workspace_id: string
          full_name: string
          phone: string
          email: string | null
          source: string | null
          requirement: string | null
          budget_min: number | null
          budget_max: number | null
          estimated_value: number | null
          assigned_to: string | null
          stage: LeadStage
          priority: LeadPriority
          status: LeadStatus
          next_follow_up_at: string | null
          won_at: string | null
          last_activity_at: string | null
          last_contacted_at: string | null
          lost_reason: LostReason | null
          lost_notes: string | null
          lost_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          full_name: string
          phone: string
          email?: string | null
          source?: string | null
          requirement?: string | null
          budget_min?: number | null
          budget_max?: number | null
          estimated_value?: number | null
          assigned_to?: string | null
          stage?: LeadStage
          priority?: LeadPriority
          status?: LeadStatus
          next_follow_up_at?: string | null
          won_at?: string | null
          last_activity_at?: string | null
          last_contacted_at?: string | null
          lost_reason?: LostReason | null
          lost_notes?: string | null
          lost_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          phone?: string
          email?: string | null
          source?: string | null
          requirement?: string | null
          budget_min?: number | null
          budget_max?: number | null
          estimated_value?: number | null
          assigned_to?: string | null
          stage?: LeadStage
          priority?: LeadPriority
          status?: LeadStatus
          next_follow_up_at?: string | null
          last_activity_at?: string | null
          last_contacted_at?: string | null
          lost_reason?: LostReason | null
          lost_notes?: string | null
          lost_at?: string | null
          updated_at?: string
        }
      }
      follow_ups: {
        Row: {
          id: string
          workspace_id: string
          lead_id: string
          assigned_to: string | null
          scheduled_at: string
          completed_at: string | null
          status: FollowUpStatus
          type: FollowUpType | null
          outcome: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          lead_id: string
          assigned_to?: string | null
          scheduled_at: string
          completed_at?: string | null
          status?: FollowUpStatus
          type?: FollowUpType | null
          outcome?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          scheduled_at?: string
          completed_at?: string | null
          status?: FollowUpStatus
          type?: FollowUpType | null
          outcome?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      activities: {
        Row: {
          id: string
          workspace_id: string
          lead_id: string
          actor_user_id: string | null
          activity_type: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          lead_id: string
          actor_user_id?: string | null
          activity_type: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          activity_type?: string
          metadata?: Json
        }
      }
      lead_notes: {
        Row: {
          id: string
          workspace_id: string
          lead_id: string
          author_user_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          lead_id: string
          author_user_id: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          content?: string
          updated_at?: string
        }
      }
      invitations: {
        Row: {
          id: string
          workspace_id: string
          email: string
          role: 'manager' | 'agent'
          token_hash: string
          expires_at: string
          accepted_at: string | null
          invited_by: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          email: string
          role: 'manager' | 'agent'
          token_hash: string
          expires_at: string
          accepted_at?: string | null
          invited_by: string
          created_at?: string
        }
        Update: {
          accepted_at?: string | null
        }
      }
      workspace_settings: {
        Row: {
          workspace_id: string
          timezone: string
          currency: string
          hot_lead_inactivity_hours: number
          new_lead_contact_threshold_hours: number
          high_value_threshold: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          workspace_id: string
          timezone?: string
          currency?: string
          hot_lead_inactivity_hours?: number
          new_lead_contact_threshold_hours?: number
          high_value_threshold?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          timezone?: string
          currency?: string
          hot_lead_inactivity_hours?: number
          new_lead_contact_threshold_hours?: number
          high_value_threshold?: number | null
          updated_at?: string
        }
      }
    }
    Functions: {
      is_active_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      get_workspace_role: {
        Args: { p_workspace_id: string }
        Returns: string | null
      }
      create_workspace: {
        Args: { p_name: string; p_slug: string; p_timezone?: string; p_currency?: string }
        Returns: Json
      }
    }
  }
}
