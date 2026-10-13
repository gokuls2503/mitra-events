import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/shared/api/client'

/** undefined = unchanged, null = remove the image, File = upload a new one. */
export type ImageChange = File | null | undefined

export interface SaveArgs {
  id?: number
  data: Record<string, unknown>
  images?: Record<string, ImageChange>
}

export function useCmsList<T>(resource: string) {
  return useQuery({
    queryKey: ['cms', resource],
    queryFn: async () => (await api.get<T[]>(`/cms/${resource}/`)).data,
  })
}

/**
 * Saves JSON first, then uploads any new images as a separate multipart PATCH
 * (keeps list fields like `inclusions` as real JSON instead of form strings).
 */
export function useCmsSave<T extends { id: number }>(resource: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data, images = {} }: SaveArgs) => {
      const json: Record<string, unknown> = { ...data }
      // Image fields never go in the JSON body (the current value is a URL string, which the API
      // rejects); they're either cleared here with null or uploaded below as files.
      for (const [field, change] of Object.entries(images)) {
        if (change === null) json[field] = null
        else delete json[field]
      }

      let saved = id
        ? (await api.patch<T>(`/cms/${resource}/${id}/`, json)).data
        : (await api.post<T>(`/cms/${resource}/`, json)).data

      const uploads = Object.entries(images).filter((entry): entry is [string, File] => entry[1] instanceof File)
      if (uploads.length) {
        const form = new FormData()
        uploads.forEach(([field, file]) => form.append(field, file))
        saved = (await api.patch<T>(`/cms/${resource}/${saved.id}/`, form)).data
      }
      return saved
    },
    onSuccess: () => invalidate(queryClient, resource),
  })
}

export function useCmsDelete(resource: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/cms/${resource}/${id}/`),
    onSuccess: () => invalidate(queryClient, resource),
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, resource: string) {
  queryClient.invalidateQueries({ queryKey: ['cms', resource] })
  // So the public site shows the change immediately in this browser too.
  queryClient.invalidateQueries({ queryKey: ['public'] })
}

/** "a\nb\n\nc" ⇄ ["a", "b", "c"] for list fields edited as one-per-line text. */
export const linesToList = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
export const listToLines = (list: string[] | undefined) => (list ?? []).join('\n')

/** Empty number inputs become null for nullable API fields. */
export const numOrNull = (v: string | number | null | undefined) => (v === '' || v === null || v === undefined ? null : v)
