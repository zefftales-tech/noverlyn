export interface NormalizedPhone {
  raw: string
  normalized: string
  isValid: boolean
  hasCountryCode: boolean
  warning?: string
}

export interface TemplateVariablesContext {
  leadName?: string
  agentName?: string
  workspaceName?: string
  propertyRequirement?: string
  nextFollowUpDate?: string
}

/**
 * Normalizes phone numbers for WhatsApp links safely
 * - Strips spaces, dashes, brackets, and leading '+'
 * - Preserves numeric country codes
 * - Validates length and warns if country code is missing
 */
export function normalizePhoneNumber(rawPhone: string): NormalizedPhone {
  if (!rawPhone) {
    return { raw: '', normalized: '', isValid: false, hasCountryCode: false, warning: 'Phone number is empty' }
  }

  // Remove spaces, dashes, parentheses, dots, and plus signs
  const digitsOnly = rawPhone.replace(/[\s()+\-.]/g, '')

  // Reject invalid non-numeric strings
  if (!/^\d+$/.test(digitsOnly)) {
    return {
      raw: rawPhone,
      normalized: '',
      isValid: false,
      hasCountryCode: false,
      warning: 'Phone number contains invalid characters',
    }
  }

  // Length validation for E.164 compliant numbers (typically 7 to 15 digits)
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return {
      raw: rawPhone,
      normalized: digitsOnly,
      isValid: false,
      hasCountryCode: digitsOnly.length >= 11,
      warning: 'Phone number length is invalid (must be 7-15 digits)',
    }
  }

  // Check if country code appears to be included (10+ digits without leading zero)
  const hasCountryCode = digitsOnly.length >= 10 && !digitsOnly.startsWith('0')

  return {
    raw: rawPhone,
    normalized: digitsOnly,
    isValid: true,
    hasCountryCode,
    warning: !hasCountryCode ? 'Country code might be missing (e.g. +1 or +44)' : undefined,
  }
}

/**
 * Generates a wa.me link with prefilled text
 */
export function generateWhatsAppUrl(phone: string, text?: string): string {
  const parsed = normalizePhoneNumber(phone)
  if (!parsed.isValid) return '#'

  const baseUrl = `https://wa.me/${parsed.normalized}`
  if (text && text.trim()) {
    return `${baseUrl}?text=${encodeURIComponent(text.trim())}`
  }
  return baseUrl
}

/**
 * Replaces template variables in WhatsApp message templates
 * Variables supported: {{lead_name}}, {{agent_name}}, {{workspace_name}}, {{property_requirement}}, {{next_follow_up_date}}
 */
export function renderTemplateVariables(template: string, ctx: TemplateVariablesContext): string {
  if (!template) return ''

  return template
    .replace(/\{\{\s*lead_name\s*\}\}/gi, ctx.leadName || 'Valued Client')
    .replace(/\{\{\s*agent_name\s*\}\}/gi, ctx.agentName || 'Your Representative')
    .replace(/\{\{\s*workspace_name\s*\}\}/gi, ctx.workspaceName || 'Our Team')
    .replace(/\{\{\s*property_requirement\s*\}\}/gi, ctx.propertyRequirement || 'your requested property')
    .replace(/\{\{\s*next_follow_up_date\s*\}\}/gi, ctx.nextFollowUpDate || 'soon')
}
