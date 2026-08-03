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

  if (!digitsOnly || !/^\d+$/.test(digitsOnly)) {
    return { raw: rawPhone, normalized: '', isValid: false, hasCountryCode: false, warning: 'Contains invalid non-numeric characters' }
  }

  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return { raw: rawPhone, normalized: digitsOnly, isValid: false, hasCountryCode: digitsOnly.length > 10, warning: 'Phone number length should be between 8 and 15 digits' }
  }

  const hasCountryCode = digitsOnly.length >= 11
  const warning = !hasCountryCode ? 'Missing country code. WhatsApp requires international format.' : undefined

  return {
    raw: rawPhone,
    normalized: digitsOnly,
    isValid: true,
    hasCountryCode,
    warning,
  }
}

/**
 * Formats a raw phone number cleanly with a leading +
 */
export function formatPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return 'N/A'
  const p = normalizePhoneNumber(rawPhone)
  if (!p.normalized) return rawPhone
  return `+${p.normalized}`
}

/**
 * Generates official wa.me deep links for native WhatsApp app / browser launching
 */
export function generateWhatsAppUrl(phone: string, textMessage?: string): string {
  const parsed = normalizePhoneNumber(phone)
  if (!parsed.isValid || !parsed.normalized) {
    return ''
  }

  const baseUrl = `https://wa.me/${parsed.normalized}`
  if (textMessage && textMessage.trim()) {
    return `${baseUrl}?text=${encodeURIComponent(textMessage.trim())}`
  }

  return baseUrl
}

/**
 * Renders WhatsApp message template variables safely
 */
export function renderTemplateVariables(templateText: string, ctx: TemplateVariablesContext): string {
  if (!templateText) return ''
  return templateText
    .replace(/\{\{\s*lead_name\s*\}\}/gi, ctx.leadName || 'Customer')
    .replace(/\{\{\s*agent_name\s*\}\}/gi, ctx.agentName || 'Our Team')
    .replace(/\{\{\s*workspace_name\s*\}\}/gi, ctx.workspaceName || 'Noverlyn')
    .replace(/\{\{\s*property_requirement\s*\}\}/gi, ctx.propertyRequirement || 'your inquiry')
    .replace(/\{\{\s*next_followup_date\s*\}\}/gi, ctx.nextFollowUpDate || 'soon')
}
