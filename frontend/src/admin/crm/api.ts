import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { EventType } from '@/public/api'
import { api } from '@/shared/api/client'
import type { Role } from '@/shared/auth/roles'

export type LeadStatus = 'NEW' | 'CONTACTED' | 'MEETING' | 'QUOTATION_SENT' | 'NEGOTIATION' | 'WON' | 'LOST'
export type LeadSource = 'WEBSITE' | 'ESTIMATOR' | 'PHONE' | 'WHATSAPP' | 'WALK_IN' | 'INSTAGRAM' | 'FACEBOOK' | 'REFERRAL' | 'OTHER'
export type BookingStatus = 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type FollowUpKind = 'CALL' | 'WHATSAPP' | 'MEETING' | 'SITE_VISIT' | 'EMAIL'
export type ActivityKind = 'CREATED' | 'STATUS' | 'ASSIGNED' | 'NOTE' | 'CALL' | 'WHATSAPP' | 'MEETING' | 'FOLLOW_UP' | 'CONVERTED'

export interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface TeamMember {
  id: number
  full_name: string
  role: Role
}

export interface Lead {
  id: number
  name: string
  phone: string
  /** Up to two more numbers, +91XXXXXXXXXX. */
  extra_phones: string[]
  email: string
  client: number | null
  client_name: string | null
  /** The first event type picked (drives filters and booking conversion). */
  event_type: EventType | ''
  /** Every event type, in the order picked. */
  event_types: EventType[]
  /** All picked types joined: "Engagement, Wedding, Birthday". */
  event_type_label: string
  event_date: string | null
  end_date: string | null
  /** "HH:MM:SS" */
  start_time: string | null
  setup_time: string | null
  venue: string
  venue_address: string
  coordinator: number | null
  guest_count: number | null
  budget: string | null
  message: string
  service: number | null
  service_name: string | null
  package: number | null
  package_name: string | null
  estimate: {
    tier: string
    guests: number
    low: number
    high: number
    total: number
    lines: { label: string; amount: number }[]
  } | null
  source: LeadSource
  source_label: string
  source_page: string
  status: LeadStatus
  status_label: string
  status_changed_at: string
  lost_reason: string
  assigned_to: number | null
  assigned_to_detail: TeamMember | null
  booking: { id: number; number: string } | null
  next_follow_up: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: number
  kind: ActivityKind
  kind_label: string
  text: string
  created_by_name: string | null
  created_at: string
}

export interface FollowUp {
  id: number
  lead: number
  lead_name: string
  lead_phone: string
  lead_status: LeadStatus
  due_at: string
  kind: FollowUpKind
  kind_label: string
  notes: string
  assigned_to: number | null
  assigned_to_name: string | null
  completed_at: string | null
  completed_by_name: string | null
  outcome: string
  is_overdue: boolean
}

export interface Client {
  id: number
  name: string
  phone: string
  alt_phone: string
  email: string
  address: string
  city: string
  gstin: string
  notes: string
  lead_count: number
  booking_count: number
  created_at: string
}

export interface Booking {
  id: number
  number: string
  client: number
  client_name: string
  client_phone: string
  lead_id: number | null
  title: string
  /** The first event type picked. */
  event_type: EventType
  /** Every event type, in the order picked. */
  event_types: EventType[]
  /** All picked types joined: "Engagement, Wedding". */
  event_type_label: string
  package: number | null
  package_name: string | null
  event_date: string
  end_date: string | null
  start_time: string | null
  setup_time: string | null
  venue: string
  venue_address: string
  guest_count: number | null
  agreed_amount: string | null
  status: BookingStatus
  status_label: string
  coordinator: number | null
  coordinator_name: string | null
  notes: string
  created_at: string
}

export interface Pipeline {
  statuses: { status: LeadStatus; label: string; count: number; budget: number }[]
  new_count: number
}

export type Params = Record<string, string | number | boolean | undefined | null>

const clean = (p: Params) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''))

// --- Queries -------------------------------------------------------------------

export const useTeam = () =>
  useQuery({ queryKey: ['team'], queryFn: async () => (await api.get<TeamMember[]>('/team/')).data, staleTime: 5 * 60_000 })

export const useLeads = (params: Params) =>
  useQuery({
    queryKey: ['crm', 'leads', clean(params)],
    queryFn: async () => (await api.get<Page<Lead>>('/crm/leads/', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  })

export const usePipeline = (params: Params = {}, options: { refetchInterval?: number } = {}) =>
  useQuery({
    queryKey: ['crm', 'pipeline', clean(params)],
    queryFn: async () => (await api.get<Pipeline>('/crm/leads/pipeline/', { params: clean(params) })).data,
    ...options,
  })

export const useLead = (id: number) =>
  useQuery({ queryKey: ['crm', 'lead', id], queryFn: async () => (await api.get<Lead>(`/crm/leads/${id}/`)).data })

export const useActivities = (leadId: number) =>
  useQuery({
    queryKey: ['crm', 'lead', leadId, 'activities'],
    queryFn: async () => (await api.get<Activity[]>(`/crm/leads/${leadId}/activities/`)).data,
  })

export const useFollowUps = (params: Params) =>
  useQuery({
    queryKey: ['crm', 'follow-ups', clean(params)],
    queryFn: async () => (await api.get<Page<FollowUp>>('/crm/follow-ups/', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  })

export const useClients = (params: Params) =>
  useQuery({
    queryKey: ['crm', 'clients', clean(params)],
    queryFn: async () => (await api.get<Page<Client>>('/crm/clients/', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  })

export const useClient = (id: number) =>
  useQuery({ queryKey: ['crm', 'client', id], queryFn: async () => (await api.get<Client>(`/crm/clients/${id}/`)).data })

export const useBookings = (params: Params) =>
  useQuery({
    queryKey: ['crm', 'bookings', clean(params)],
    queryFn: async () => (await api.get<Page<Booking>>('/crm/bookings/', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  })

export const useBooking = (id: number) =>
  useQuery({ queryKey: ['crm', 'booking', id], queryFn: async () => (await api.get<Booking>(`/crm/bookings/${id}/`)).data, enabled: id > 0 })

// --- Mutations -------------------------------------------------------------------

/** Every CRM write refreshes all CRM data — cheap at this scale and never stale. */
export function useCrmMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    // Not awaited on purpose: the refetch can unmount the calling form (e.g. converting a lead
    // closes its dialog), and the caller's own onSuccess — such as navigating — must run first.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] })
      void queryClient.invalidateQueries({ queryKey: ['ops'] }) // dashboard counts
    },
  })
}

export const crm = {
  createLead: async (data: Partial<Lead>) => (await api.post<Lead>('/crm/leads/', data)).data,
  updateLead: async ({ id, ...data }: Partial<Lead> & { id: number }) => (await api.patch<Lead>(`/crm/leads/${id}/`, data)).data,
  deleteLead: (id: number) => api.delete(`/crm/leads/${id}/`),
  changeStatus: async ({ id, ...body }: { id: number; status: LeadStatus; lost_reason?: string; note?: string }) =>
    (await api.post<Lead>(`/crm/leads/${id}/status/`, body)).data,
  assign: async ({ id, assigned_to }: { id: number; assigned_to: number | null }) =>
    (await api.post<Lead>(`/crm/leads/${id}/assign/`, { assigned_to })).data,
  addActivity: async ({ id, kind, text }: { id: number; kind: ActivityKind; text: string }) =>
    (await api.post<Activity>(`/crm/leads/${id}/activities/`, { kind, text })).data,
  convert: async ({ id, ...body }: { id: number } & Record<string, unknown>) =>
    (await api.post<Booking>(`/crm/leads/${id}/convert/`, body)).data,
  createFollowUp: async (data: Partial<FollowUp>) => (await api.post<FollowUp>('/crm/follow-ups/', data)).data,
  completeFollowUp: async ({ id, outcome }: { id: number; outcome: string }) =>
    (await api.post<FollowUp>(`/crm/follow-ups/${id}/complete/`, { outcome })).data,
  deleteFollowUp: (id: number) => api.delete(`/crm/follow-ups/${id}/`),
  saveClient: async ({ id, ...data }: Partial<Client>) =>
    (id ? await api.patch<Client>(`/crm/clients/${id}/`, data) : await api.post<Client>('/crm/clients/', data)).data,
  saveBooking: async ({ id, ...data }: Partial<Booking>) =>
    (id ? await api.patch<Booking>(`/crm/bookings/${id}/`, data) : await api.post<Booking>('/crm/bookings/', data)).data,
}
