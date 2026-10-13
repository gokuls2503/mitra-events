import { EVENT_TYPE_LABELS } from '@/public/api'

import type { BookingStatus, FollowUpKind, LeadSource, LeadStatus } from './api'

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'MEETING', label: 'Meeting / site visit' },
  { value: 'QUOTATION_SENT', label: 'Quotation sent' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
]
export const OPEN_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'MEETING', 'QUOTATION_SENT', 'NEGOTIATION']

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'PHONE', label: 'Phone call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'ESTIMATOR', label: 'Website cost estimator' },
  { value: 'OTHER', label: 'Other' },
]

export const FOLLOW_UP_KINDS: { value: FollowUpKind; label: string }[] = [
  { value: 'CALL', label: 'Call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'SITE_VISIT', label: 'Site visit' },
  { value: 'EMAIL', label: 'Email' },
]

export const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export const EVENT_TYPES = Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))

/** Top border colour of each pipeline column. */
export const LEAD_STATUS_ACCENT: Record<LeadStatus, string> = {
  NEW: 'border-sky-400',
  CONTACTED: 'border-indigo-400',
  MEETING: 'border-violet-400',
  QUOTATION_SENT: 'border-amber-400',
  NEGOTIATION: 'border-orange-400',
  WON: 'border-green-500',
  LOST: 'border-stone-400',
}
