import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/shared/api/client'

export interface GalleryCategory {
  id: number
  name: string
  order: number
  image_count: number
}

export interface GalleryImage {
  id: number
  image: string
  caption: string
  gallery_category: number | null
  gallery_category_name: string | null
  is_featured: boolean
  is_published: boolean
}

const CATEGORIES = ['cms', 'gallery-categories']
const IMAGES = ['cms', 'gallery']

export const UNCATEGORISED = 'Uncategorised'

export const useGalleryCategories = () =>
  useQuery({ queryKey: CATEGORIES, queryFn: async () => (await api.get<GalleryCategory[]>('/cms/gallery-categories/')).data })

/** Every image, featured first. Counts per category and tab are worked out from this list. */
export const useGalleryImages = () =>
  useQuery({ queryKey: IMAGES, queryFn: async () => (await api.get<GalleryImage[]>('/cms/gallery/')).data })

function useGalleryMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATEGORIES })
      void qc.invalidateQueries({ queryKey: IMAGES })
    },
  })
}

export const useAddCategory = () =>
  useGalleryMutation(async (name: string) => (await api.post<GalleryCategory>('/cms/gallery-categories/', { name })).data)

export const useRenameCategory = () =>
  useGalleryMutation(async ({ id, name }: { id: number; name: string }) => (await api.patch<GalleryCategory>(`/cms/gallery-categories/${id}/`, { name })).data)

export const useDeleteCategory = () => useGalleryMutation((id: number) => api.delete(`/cms/gallery-categories/${id}/`))

export const useDeleteImage = () => useGalleryMutation((id: number) => api.delete(`/cms/gallery/${id}/`))

/** Star toggle, applied to the list straight away so the star responds instantly. */
export function useToggleFeatured() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (img: GalleryImage) => (await api.patch<GalleryImage>(`/cms/gallery/${img.id}/`, { is_featured: !img.is_featured })).data,
    onMutate: (img) => {
      qc.setQueryData<GalleryImage[]>(IMAGES, (list) => list?.map((i) => (i.id === img.id ? { ...i, is_featured: !i.is_featured } : i)))
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: IMAGES }),
  })
}

export function useRefreshGallery() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: CATEGORIES })
    void qc.invalidateQueries({ queryKey: IMAGES })
  }
}

/** Uploads one (already compressed) image into a category, reporting progress 0–1. */
export async function uploadGalleryImage(categoryId: number, file: Blob, name: string, onProgress: (fraction: number) => void) {
  const form = new FormData()
  form.append('image', file, `${name || 'photo'}.jpg`)
  form.append('gallery_category', String(categoryId))
  form.append('caption', name.slice(0, 160))
  form.append('is_published', 'true') // the server also defaults this, but say it explicitly
  return (
    await api.post<GalleryImage>('/cms/gallery/', form, {
      onUploadProgress: (e) => e.total && onProgress(e.loaded / e.total),
    })
  ).data
}
