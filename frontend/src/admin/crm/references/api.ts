import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/shared/api/client'

export type Section = 'design' | 'stage'
export type Source = 'ours' | 'client'

export interface LeadImage {
  id: number
  lead: number
  section: Section
  image: string
  thumbnail: string | null
  caption: string
  source: Source
  uploaded_by_name: string | null
  created_at: string
}

export interface LeadItem {
  id: number
  lead: number
  catalog_item: number | null
  name: string
  unit: string
  qty: string
  rate: string
  amount: string
  is_custom: boolean
}

export interface ItemsPayload {
  items: LeadItem[]
  count: number
  total: string
}

export type Category = 'flowers' | 'decor' | 'lighting' | 'fabric' | 'furniture' | 'other'

export interface Material {
  id: number
  name: string
  category: Category
  category_label: string
  default_unit: string
  default_rate: string | null
  is_active: boolean
}

export interface MaterialChoices {
  units: string[]
  categories: { value: Category; label: string }[]
}

/** Units and categories come from the server (backend/apps/crm/units.py), the one list to edit. */
export const useMaterialChoices = () =>
  useQuery({
    queryKey: ['crm', 'materials', 'choices'],
    queryFn: async () => (await api.get<MaterialChoices>('/crm/materials/choices/')).data,
    staleTime: Infinity,
  })

/** Dropdown options for a unit, keeping an older free-text value (e.g. "1kg") selectable. */
export function unitOptions(units: string[], current: string, blankLabel = 'Pick unit') {
  const list = current && !units.includes(current) ? [current, ...units] : units
  return [{ value: '', label: blankLabel }, ...list.map((u) => ({ value: u, label: u }))]
}

const imagesKey = (leadId: number) => ['crm', 'lead', leadId, 'images']
const itemsKey = (leadId: number) => ['crm', 'lead', leadId, 'items']

export const useLeadImages = (leadId: number) =>
  useQuery({
    queryKey: imagesKey(leadId),
    queryFn: async () => (await api.get<LeadImage[]>(`/crm/leads/${leadId}/images/`)).data,
  })

export const useLeadItems = (leadId: number) =>
  useQuery({
    queryKey: itemsKey(leadId),
    queryFn: async () => (await api.get<ItemsPayload>(`/crm/leads/${leadId}/items/`)).data,
  })

export const useMaterials = (params: { active?: boolean } = {}) =>
  useQuery({
    queryKey: ['crm', 'materials', params],
    queryFn: async () =>
      (await api.get<Material[]>('/crm/materials/', { params: params.active ? { is_active: true } : {} })).data,
    staleTime: 60_000,
  })

/** Uploads one (already compressed) image, reporting progress 0–1. */
export async function uploadLeadImage(
  leadId: number,
  file: Blob,
  fields: { section: Section; source: Source; caption?: string },
  onProgress: (fraction: number) => void,
) {
  const form = new FormData()
  form.append('image', file, 'photo.jpg')
  form.append('section', fields.section)
  form.append('source', fields.source)
  form.append('caption', fields.caption ?? '')
  const res = await api.post<LeadImage>(`/crm/leads/${leadId}/images/`, form, {
    onUploadProgress: (e) => e.total && onProgress(e.loaded / e.total),
  })
  return res.data
}

function useRefMutation<TVars, TResult>(leadId: number, fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: imagesKey(leadId) })
      void qc.invalidateQueries({ queryKey: itemsKey(leadId) })
    },
  })
}

export const useUpdateImage = (leadId: number) =>
  useRefMutation(leadId, async ({ id, ...data }: { id: number; caption?: string; section?: Section; source?: Source }) =>
    (await api.patch<LeadImage>(`/crm/lead-images/${id}/`, data)).data,
  )

export const useDeleteImage = (leadId: number) => useRefMutation(leadId, (id: number) => api.delete(`/crm/lead-images/${id}/`))

export const useAddItem = (leadId: number) =>
  useRefMutation(leadId, async (data: { catalog_item: number | null; name: string; unit: string; qty: string; rate: string }) =>
    (await api.post<LeadItem>(`/crm/leads/${leadId}/items/`, data)).data,
  )

export const useUpdateItem = (leadId: number) =>
  useRefMutation(leadId, async ({ id, ...data }: { id: number; qty?: string; rate?: string }) =>
    (await api.patch<LeadItem>(`/crm/lead-items/${id}/`, data)).data,
  )

export const useDeleteItem = (leadId: number) => useRefMutation(leadId, (id: number) => api.delete(`/crm/lead-items/${id}/`))

export function useSaveToMaterials(leadId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; category: Category; unit: string; default_rate: string | null }) =>
      (await api.post<{ item: LeadItem; created: boolean; material: string }>(`/crm/lead-items/${id}/save-to-materials/`, data)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: itemsKey(leadId) })
      void qc.invalidateQueries({ queryKey: ['crm', 'materials'] })
    },
  })
}

export function useInvalidateImages(leadId: number) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: imagesKey(leadId) })
}
