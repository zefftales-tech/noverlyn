export type BusinessType = 'real_estate' | 'agency' | 'home_services' | 'general'

export interface PipelineStageConfig {
  key: string
  label: string
  position: number
  is_won?: boolean
  is_lost?: boolean
  requires_next_action?: boolean
}

export interface BusinessTemplate {
  businessType: BusinessType
  title: string
  description: string
  requirementLabel: string
  stages: PipelineStageConfig[]
  sources: Array<{ value: string; label: string }>
}

export const BUSINESS_TEMPLATES: Record<BusinessType, BusinessTemplate> = {
  real_estate: {
    businessType: 'real_estate',
    title: 'Real Estate',
    description: 'Lead operations for property sales, leasing, viewings, and agent follow-ups.',
    requirementLabel: 'Property Requirement',
    stages: [
      { key: 'new', label: 'New Lead', position: 1 },
      { key: 'contacted', label: 'Contacted', position: 2 },
      { key: 'qualified', label: 'Qualified', position: 3 },
      { key: 'property_shared', label: 'Property Shared', position: 4 },
      { key: 'viewing_scheduled', label: 'Viewing Scheduled', position: 5 },
      { key: 'negotiation', label: 'Negotiation', position: 6, requires_next_action: true },
      { key: 'won', label: 'Won', position: 7, is_won: true },
      { key: 'lost', label: 'Lost', position: 8, is_lost: true },
    ],
    sources: [
      { value: 'website', label: 'Company Website' },
      { value: 'whatsapp', label: 'WhatsApp Inquiry' },
      { value: 'call', label: 'Direct Phone Call' },
      { value: 'referral', label: 'Client Referral' },
      { value: 'portal', label: 'Property Portal' },
      { value: 'facebook', label: 'Facebook Ads' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'walk_in', label: 'Office Walk-in' },
      { value: 'other', label: 'Other Source' },
    ],
  },

  agency: {
    businessType: 'agency',
    title: 'Agency & B2B Services',
    description: 'Pipeline for marketing agencies, software firms, and professional service providers.',
    requirementLabel: 'Service Need',
    stages: [
      { key: 'new', label: 'New Lead', position: 1 },
      { key: 'contacted', label: 'Contacted', position: 2 },
      { key: 'qualified', label: 'Qualified', position: 3 },
      { key: 'discovery', label: 'Discovery Call', position: 4 },
      { key: 'proposal', label: 'Proposal Sent', position: 5, requires_next_action: true },
      { key: 'negotiation', label: 'Contract Negotiation', position: 6, requires_next_action: true },
      { key: 'won', label: 'Deal Won', position: 7, is_won: true },
      { key: 'lost', label: 'Deal Lost', position: 8, is_lost: true },
    ],
    sources: [
      { value: 'website', label: 'Company Website' },
      { value: 'referral', label: 'Client Referral' },
      { value: 'linkedin', label: 'LinkedIn Outreach' },
      { value: 'email', label: 'Cold Email' },
      { value: 'call', label: 'Inbound Call' },
      { value: 'facebook', label: 'Facebook / Meta' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'other', label: 'Other Source' },
    ],
  },

  home_services: {
    businessType: 'home_services',
    title: 'Home & Contracting Services',
    description: 'Operational tracking for HVAC, plumbing, roofing, remodeling, and field services.',
    requirementLabel: 'Job Requirement',
    stages: [
      { key: 'new', label: 'New Lead', position: 1 },
      { key: 'contacted', label: 'Contacted', position: 2 },
      { key: 'qualified', label: 'Qualified', position: 3 },
      { key: 'estimate_sent', label: 'Estimate Sent', position: 4, requires_next_action: true },
      { key: 'scheduled', label: 'Job Scheduled', position: 5 },
      { key: 'in_progress', label: 'Work In Progress', position: 6 },
      { key: 'won', label: 'Job Won / Paid', position: 7, is_won: true },
      { key: 'lost', label: 'Estimate Declined', position: 8, is_lost: true },
    ],
    sources: [
      { value: 'website', label: 'Company Website' },
      { value: 'call', label: 'Inbound Phone Call' },
      { value: 'referral', label: 'Neighbor Referral' },
      { value: 'google', label: 'Google Search / Local Ads' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'walk_in', label: 'Field / Yard Sign' },
      { value: 'other', label: 'Other Source' },
    ],
  },

  general: {
    businessType: 'general',
    title: 'General Business Operations',
    description: 'Universal lead management pipeline for general commercial businesses.',
    requirementLabel: 'Customer Requirement',
    stages: [
      { key: 'new', label: 'New Lead', position: 1 },
      { key: 'contacted', label: 'Contacted', position: 2 },
      { key: 'qualified', label: 'Qualified', position: 3 },
      { key: 'proposal', label: 'Proposal', position: 4, requires_next_action: true },
      { key: 'negotiation', label: 'Negotiation', position: 5, requires_next_action: true },
      { key: 'won', label: 'Won', position: 6, is_won: true },
      { key: 'lost', label: 'Lost', position: 7, is_lost: true },
    ],
    sources: [
      { value: 'website', label: 'Website' },
      { value: 'referral', label: 'Referral' },
      { value: 'call', label: 'Phone Call' },
      { value: 'email', label: 'Email' },
      { value: 'social', label: 'Social Media' },
      { value: 'other', label: 'Other' },
    ],
  },
}

export function getTemplateForBusinessType(businessType?: string | null): BusinessTemplate {
  const bType = (businessType || 'real_estate') as BusinessType
  return BUSINESS_TEMPLATES[bType] || BUSINESS_TEMPLATES.real_estate
}
