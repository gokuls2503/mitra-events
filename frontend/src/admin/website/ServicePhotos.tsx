import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react'
import { useId } from 'react'

import { api } from '@/shared/api/client'

import type { CmsServiceImage } from './types'
import { FormError } from '../kit'

const MAX_MB = 5

/**
 * The extra slideshow photos on a service page. Changes save straight away (no Save button),
 * so the service has to exist first. The cover image is always the first slide.
 */
export function ServicePhotos({ serviceId }: { serviceId: number }) {
  const id = useId()
  const queryClient = useQueryClient()
  const key = ['cms', 'service-images', serviceId]
  const { data: photos = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<CmsServiceImage[]>('/cms/service-images/', { params: { service: serviceId } })).data,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key })
    queryClient.invalidateQueries({ queryKey: ['cms', 'services'] })
    queryClient.invalidateQueries({ queryKey: ['public'] })
  }

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024)
      if (tooBig) throw new Error(`${tooBig.name} is over ${MAX_MB} MB.`)
      let order = photos.reduce((max, p) => Math.max(max, p.order), 0)
      // One at a time, so they keep the order they were picked in.
      for (const file of files) {
        const form = new FormData()
        form.append('service', String(serviceId))
        form.append('order', String(++order))
        form.append('image', file)
        await api.post('/cms/service-images/', form)
      }
    },
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: (photoId: number) => api.delete(`/cms/service-images/${photoId}/`),
    onSettled: refresh,
  })

  // Swap a photo with its neighbour, renumbering every photo so equal orders can't get stuck.
  const move = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const list = [...photos]
      ;[list[from], list[to]] = [list[to], list[from]]
      await Promise.all(
        list.flatMap((p, i) => (p.order === i + 1 ? [] : [api.patch(`/cms/service-images/${p.id}/`, { order: i + 1 })])),
      )
    },
    onSettled: refresh,
  })

  const busy = upload.isPending || remove.isPending || move.isPending
  const error = upload.error ?? remove.error ?? move.error

  return (
    <div className="sm:col-span-2">
      <p className="mb-1 text-sm font-medium text-stone-700">Slideshow photos</p>
      <p className="mb-3 text-xs text-stone-500">
        Shown after the cover image on the service page. Use the arrows to change the order. Changes save straight away.
      </p>
      <ul className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <li key={p.id} className="w-28">
            <img src={p.image} alt="" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-stone-200" />
            <div className="mt-1 flex items-center justify-between text-stone-500">
              <button
                type="button"
                disabled={busy || i === 0}
                onClick={() => move.mutate({ from: i, to: i - 1 })}
                aria-label="Move earlier"
                className="rounded p-1 hover:bg-stone-100 disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate(p.id)}
                aria-label="Remove photo"
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                disabled={busy || i === photos.length - 1}
                onClick={() => move.mutate({ from: i, to: i + 1 })}
                aria-label="Move later"
                className="rounded p-1 hover:bg-stone-100 disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </li>
        ))}
        <li className="relative w-28">
          <label
            htmlFor={id}
            className={`grid aspect-[4/3] w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed border-stone-300 text-center text-xs text-stone-500 hover:border-brand-400 hover:text-brand-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}
          >
            <span>
              <ImagePlus className="mx-auto mb-1 size-5" />
              {upload.isPending ? 'Uploading…' : 'Add photos'}
            </span>
          </label>
          <input
            id={id}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) upload.mutate(files)
            }}
          />
        </li>
      </ul>
      {isLoading && <p className="mt-2 text-xs text-stone-500">Loading photos…</p>}
      <p className="mt-2 text-xs text-stone-500">JPG, PNG or WebP, under {MAX_MB} MB each. You can pick several at once.</p>
      {error && !axios.isAxiosError(error) ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>
      ) : (
        <FormError error={error} />
      )}
    </div>
  )
}
