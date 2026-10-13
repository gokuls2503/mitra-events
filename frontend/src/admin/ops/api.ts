import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/shared/api/client'

import type { Page, Params } from '../crm/api'

export type VendorCategory =
  | 'FLORIST'
  | 'LIGHTING'
  | 'SOUND'
  | 'CATERING'
  | 'PHOTOGRAPHY'
  | 'TENT'
  | 'BALLOONS'
  | 'TRANSPORT'
  | 'LABOUR'
  | 'OTHER'

export type AssignmentStatus = 'PENDING' | 'CONFIRMED' | 'DONE' | 'CANCELLED'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
export type TaskPriority = 1 | 2 | 3 | 4

export interface Vendor {
  id: number
  name: string
  category: VendorCategory
  category_label: string
  contact_person: string
  phone: string
  alt_phone: string
  email: string
  address: string
  gstin: string
  notes: string
  is_active: boolean
  upcoming_jobs: number
}

export interface BookingMini {
  id: number
  number: string
  title: string
  event_date: string
  venue: string
}

export interface Assignment {
  id: number
  booking: number
  booking_detail: BookingMini
  staff: number | null
  staff_name: string | null
  vendor: number | null
  vendor_name: string | null
  vendor_category: string | null
  phone: string
  role: string
  report_time: string | null
  agreed_cost: string | null
  status: AssignmentStatus
  status_label: string
  notes: string
  conflicts: BookingMini[]
}

export interface Task {
  id: number
  title: string
  description: string
  booking: number | null
  booking_detail: BookingMini | null
  assigned_to: number | null
  assigned_to_name: string | null
  due_date: string | null
  priority: TaskPriority
  priority_label: string
  status: TaskStatus
  status_label: string
  completed_at: string | null
  completed_by_name: string | null
  created_at: string
}

export interface DashboardEvent {
  id: number
  number: string
  title: string
  event_date: string
  end_date: string | null
  start_time: string | null
  setup_time: string | null
  venue: string
  status: string
  status_label: string
  client_name: string
  coordinator_name: string | null
  tasks_total: number
  tasks_done: number
  staff_count: number
  vendor_count: number
  vendors_unconfirmed: number
}

export interface Dashboard {
  today: string
  events: DashboardEvent[]
  counts?: {
    new_leads: number
    unassigned_leads: number
    follow_ups_overdue: number
    follow_ups_today: number
    tasks_overdue: number
    tasks_today: number
    team_tasks_overdue: number
  }
  new_leads?: {
    id: number
    name: string
    event_type_label: string
    event_date: string | null
    source_label: string
    created_at: string
    assigned_to_name: string | null
  }[]
  my_tasks?: Task[]
  my_follow_ups?: { id: number; lead: number; lead_name: string; lead_phone: string; kind_label: string; due_at: string; notes: string }[]
  attention?: { events_without_coordinator: { id: number; number: string; title: string; event_date: string }[] }
  finance?: {
    financial_year: string
    receivable: string
    overdue_count: number
    overdue_amount: string
    invoiced_this_month: string
    collected_this_month: string
    gst_payable_this_month: string
    draft_invoices: number
  }
}

const clean = (p: Params) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''))

export const useDashboard = () =>
  useQuery({
    queryKey: ['ops', 'dashboard'],
    queryFn: async () => (await api.get<Dashboard>('/dashboard/')).data,
    refetchInterval: 60_000,
  })

export const useVendors = (params: Params) =>
  useQuery({
    queryKey: ['ops', 'vendors', clean(params)],
    queryFn: async () => (await api.get<Page<Vendor>>('/ops/vendors/', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  })

export const useAssignments = (params: Params, enabled = true) =>
  useQuery({
    queryKey: ['ops', 'assignments', clean(params)],
    queryFn: async () => (await api.get<Assignment[]>('/ops/assignments/', { params: clean(params) })).data,
    enabled,
  })

export const useTasks = (params: Params) =>
  useQuery({
    queryKey: ['ops', 'tasks', clean(params)],
    queryFn: async () => (await api.get<Page<Task>>('/ops/tasks/', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  })

/** Ops writes also touch the dashboard and booking pages, so refresh both families (not awaited — see crm/api). */
export function useOpsMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ops'] })
      void queryClient.invalidateQueries({ queryKey: ['crm'] })
    },
  })
}

export const ops = {
  saveVendor: async ({ id, ...data }: Partial<Vendor>) =>
    (id ? await api.patch<Vendor>(`/ops/vendors/${id}/`, data) : await api.post<Vendor>('/ops/vendors/', data)).data,
  deleteVendor: (id: number) => api.delete(`/ops/vendors/${id}/`),
  saveAssignment: async ({ id, ...data }: Partial<Assignment>) =>
    (id ? await api.patch<Assignment>(`/ops/assignments/${id}/`, data) : await api.post<Assignment>('/ops/assignments/', data)).data,
  deleteAssignment: (id: number) => api.delete(`/ops/assignments/${id}/`),
  saveTask: async ({ id, ...data }: Partial<Task>) =>
    (id ? await api.patch<Task>(`/ops/tasks/${id}/`, data) : await api.post<Task>('/ops/tasks/', data)).data,
  deleteTask: (id: number) => api.delete(`/ops/tasks/${id}/`),
  standardChecklist: async (booking: number) =>
    (await api.post<{ created: number }>('/ops/tasks/standard-checklist/', { booking })).data,
}

export const VENDOR_CATEGORIES: { value: VendorCategory; label: string }[] = [
  { value: 'FLORIST', label: 'Florist' },
  { value: 'LIGHTING', label: 'Lighting' },
  { value: 'SOUND', label: 'Sound & DJ' },
  { value: 'CATERING', label: 'Catering' },
  { value: 'PHOTOGRAPHY', label: 'Photography & video' },
  { value: 'TENT', label: 'Tent, stage & furniture' },
  { value: 'BALLOONS', label: 'Balloons & props' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'LABOUR', label: 'Labour / helpers' },
  { value: 'OTHER', label: 'Other' },
]

export const ASSIGNMENT_STATUSES: { value: AssignmentStatus; label: string }[] = [
  { value: 'PENDING', label: 'Requested' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export const TASK_PRIORITIES: { value: string; label: string }[] = [
  { value: '4', label: 'Urgent' },
  { value: '3', label: 'High' },
  { value: '2', label: 'Normal' },
  { value: '1', label: 'Low' },
]
