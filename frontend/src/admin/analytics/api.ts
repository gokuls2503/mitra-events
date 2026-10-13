import { useQuery } from '@tanstack/react-query'

import { api } from '@/shared/api/client'

export type Compare = 'last_year' | 'previous'

export interface Kpi {
  value: number | null
  previous: number | null
}

export interface MonthRow {
  month: string
  revenue: number
  collected: number
  expenses?: number
  profit?: number
  bookings: number
  booked_value: number
  leads?: number
  won?: number
}

export interface Overview {
  date_from: string
  date_to: string
  previous: { date_from: string; date_to: string; compare: Compare }
  kpis: Record<string, Kpi>
  monthly: MonthRow[]
  event_types: { event_type: string; label: string; count: number; value: number }[]
  events_held: number
  cancelled_bookings: number
  top_clients: { client_id: number; name: string; revenue: number; invoices: number; outstanding: number }[]
  leads?: {
    count: number
    won: number
    lost: number
    open: number
    conversion_pct: number | null
    win_rate_pct: number | null
    stages: { status: string; label: string; count: number }[]
    by_source: { source: string; label: string; leads: number; won: number; conversion_pct: number | null; booked_value: number }[]
    lost_reasons: { reason: string; count: number }[]
  }
  team?: { user_id: number; name: string; leads: number; won: number; lost: number; conversion_pct: number | null; booked_value: number }[]
}

export function useOverview(from: string, to: string, compare: Compare) {
  return useQuery({
    queryKey: ['analytics', 'overview', from, to, compare],
    queryFn: async () => (await api.get<Overview>('/analytics/overview/', { params: { from, to, compare } })).data,
    // Keep the previous render on screen (dimmed) while a new range loads — no skeleton flash.
    placeholderData: (prev) => prev,
  })
}
