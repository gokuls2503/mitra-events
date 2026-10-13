import clsx from 'clsx'

import type { BookingStatus, LeadStatus } from './api'

const LEAD_STATUS_STYLE: Record<LeadStatus, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  CONTACTED: 'bg-indigo-100 text-indigo-800',
  MEETING: 'bg-violet-100 text-violet-800',
  QUOTATION_SENT: 'bg-amber-100 text-amber-800',
  NEGOTIATION: 'bg-orange-100 text-orange-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-stone-200 text-stone-600',
}

const BOOKING_STATUS_STYLE: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-sky-100 text-sky-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-stone-200 text-stone-500 line-through',
}

export function LeadStatusPill({ status, label }: { status: LeadStatus; label: string }) {
  return <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', LEAD_STATUS_STYLE[status])}>{label}</span>
}

export function BookingStatusPill({ status, label }: { status: BookingStatus; label: string }) {
  return <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', BOOKING_STATUS_STYLE[status])}>{label}</span>
}
