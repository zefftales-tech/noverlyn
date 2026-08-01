import { supabase } from './supabase'

export type CustomFieldType = 'short_text' | 'long_text' | 'number' | 'select' | 'date' | 'checkbox'

export interface CustomFieldDefinition {
  id: string
  key: string
  label: string
  type: CustomFieldType
  required: boolean
  placeholder?: string
  help_text?: string
  options?: string[]
  display_order: number
  is_active: boolean
}

export interface PublicFormInfo {
  form_id: string
  workspace_id: string
  workspace_name: string
  business_type: string
  currency: string
  title: string
  description: string | null
  is_active: boolean
  show_email: boolean
  show_source: boolean
  show_budget: boolean
  custom_fields?: CustomFieldDefinition[]
}

export interface SubmitFormParams {
  slug: string
  full_name: string
  phone: string
  requirement?: string
  email?: string
  source?: string
  budget?: number
  honeypot?: string
  custom_answers?: Record<string, string | boolean | number>
}

export interface SubmitFormResult {
  success: boolean
  lead_id?: string
  is_duplicate?: boolean
  message?: string
}

export interface LeadFormConfig {
  id: string
  workspace_id: string
  slug: string
  title: string
  description: string | null
  is_active: boolean
  show_email: boolean
  show_source: boolean
  show_budget: boolean
  custom_fields?: CustomFieldDefinition[]
  submission_count: number
  created_at: string
  updated_at: string
}

export interface UpdateFormConfigParams {
  workspace_id: string
  title: string
  description?: string
  is_active: boolean
  show_email: boolean
  show_source: boolean
  show_budget: boolean
  custom_fields?: CustomFieldDefinition[]
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

export const formsApi = {
  // Public Form Info Lookup (Unauthenticated)
  getPublicFormInfo: async (slug: string): Promise<PublicFormInfo> => {
    return callRpc<PublicFormInfo>('get_public_lead_form_rpc', {
      p_slug: slug,
    })
  },

  // Public Form Submission (Unauthenticated & Rate Protected)
  submitPublicForm: async (params: SubmitFormParams): Promise<SubmitFormResult> => {
    return callRpc<SubmitFormResult>('submit_public_lead_form_rpc', {
      p_slug: params.slug,
      p_full_name: params.full_name,
      p_phone: params.phone,
      p_requirement: params.requirement || null,
      p_email: params.email || null,
      p_source: params.source || null,
      p_budget: params.budget ?? null,
      p_honeypot: params.honeypot || null,
      p_custom_answers: params.custom_answers || {},
    })
  },

  // Protected: Fetch Workspace Lead Form Configuration
  getWorkspaceLeadForm: async (workspaceId: string): Promise<LeadFormConfig | null> => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('lead_forms' as never)
      .select('*')
      .eq('workspace_id', workspaceId)
      .single()

    if (error) {
      // Auto seed if missing
      try {
        const { data: seeded } = await (supabase.rpc as unknown as (
          fnName: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: Error | null }>)('get_public_lead_form_rpc', { p_slug: workspaceId })

        if (seeded) {
          const { data: fresh } = await supabase
            .from('lead_forms' as never)
            .select('*')
            .eq('workspace_id', workspaceId)
            .single()

          return (fresh as unknown) as LeadFormConfig
        }
      } catch (err) {
        console.error('Error auto-seeding lead form:', err)
      }
      return null
    }

    return (data as unknown) as LeadFormConfig
  },

  // Protected: Update Workspace Lead Form Configuration (Owners & Managers)
  updateWorkspaceLeadForm: async (params: UpdateFormConfigParams): Promise<LeadFormConfig> => {
    return callRpc<LeadFormConfig>('update_lead_form_rpc', {
      p_workspace_id: params.workspace_id,
      p_title: params.title,
      p_description: params.description || null,
      p_is_active: params.is_active,
      p_show_email: params.show_email,
      p_show_source: params.show_source,
      p_show_budget: params.show_budget,
      p_custom_fields: params.custom_fields || [],
    })
  },
}
