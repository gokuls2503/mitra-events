import { isAxiosError } from 'axios'
import clsx from 'clsx'
import { ImagePlus, RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'

import { apiErrorMessage } from '@/shared/api/client'
import { Spinner } from '@/shared/ui/Spinner'

import { uploadLeadImage, useInvalidateImages, useLeadImages, type Section, type Source } from './api'
import { compressImage } from './compress'
import { ImageViewer } from './ImageViewer'
import { SourceBadge } from './SourceBadge'

type Filter = 'all' | Source

interface UploadState {
  done: number
  total: number
  fraction: number // progress of the current file
  errors: string[]
}

export function ImagesTab({ leadId, section, canWrite }: { leadId: number; section: Section; canWrite: boolean }) {
  const inputId = useId()
  const { data, isLoading, error, refetch } = useLeadImages(leadId)
  const refresh = useInvalidateImages(leadId)
  const [source, setSource] = useState<Source>('client')
  const [filter, setFilter] = useState<Filter>('all')
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const isDesign = section === 'design'

  const inSection = (data ?? []).filter((i) => i.section === section)
  const shown = isDesign && filter !== 'all' ? inSection.filter((i) => i.source === filter) : inSection
  const uploading = upload !== null && upload.done < upload.total

  async function handleFiles(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    const state: UploadState = { done: 0, total: list.length, fraction: 0, errors: [] }
    setUpload({ ...state })
    // One at a time: steady progress on slow mobile connections, and one failure doesn't stop the rest.
    for (const file of list) {
      try {
        const blob = await compressImage(file)
        await uploadLeadImage(leadId, blob, { section, source: isDesign ? source : 'ours' }, (f) =>
          setUpload((u) => (u ? { ...u, fraction: f } : u)),
        )
      } catch (err) {
        // Compression errors already name the file; server errors get it prefixed.
        state.errors.push(isAxiosError(err) ? `${file.name}: ${apiErrorMessage(err)}` : err instanceof Error ? err.message : file.name)
      }
      state.done += 1
      setUpload({ ...state, fraction: 0 })
      void refresh()
    }
  }

  const pct = upload ? Math.round(((upload.done + upload.fraction) / upload.total) * 100) : 0

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="space-y-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={inputId}
              className={clsx(
                'inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-100',
                uploading && 'pointer-events-none opacity-60',
              )}
            >
              <ImagePlus className="size-4" /> Choose from Gallery / Camera
            </label>
            {/* No `capture` attribute: phones then offer both the Gallery and the Camera. */}
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              className="sr-only"
              onChange={(e) => {
                void handleFiles(e.target.files)
                e.target.value = '' // allow choosing the same files again
              }}
            />
          </div>
          {isDesign && (
            <div role="radiogroup" aria-label="These images are" className="flex gap-1">
              {(
                [
                  ['ours', 'Our reference'],
                  ['client', 'From client'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={source === value}
                  onClick={() => setSource(value)}
                  className={clsx(
                    'h-11 rounded-full px-4 text-sm',
                    source === value ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {upload && (
            <div aria-live="polite">
              {uploading ? (
                <>
                  <p className="mb-1 text-xs text-stone-600">
                    Uploading {upload.done + 1} of {upload.total} · {pct}%
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-stone-600">
                  {upload.total - upload.errors.length} of {upload.total} uploaded.
                </p>
              )}
              {upload.errors.map((e) => (
                <p key={e} className="mt-1 text-xs text-red-700">
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {isDesign && inSection.length > 0 && (
        <div role="tablist" aria-label="Show" className="flex gap-1">
          {(
            [
              ['all', 'All'],
              ['ours', 'Ours'],
              ['client', 'From client'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={clsx('h-11 rounded-full px-4 text-sm', filter === value ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="aspect-4/3 animate-pulse rounded-xl bg-stone-100" />
          ))}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          Couldn't load images. {apiErrorMessage(error)}
          <button onClick={() => refetch()} className="ml-2 inline-flex h-11 items-center gap-1 underline">
            <RefreshCw className="size-3.5" /> Try again
          </button>
        </div>
      )}
      {data && shown.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
          {inSection.length > 0
            ? 'No images match this filter.'
            : isDesign
              ? 'No design references yet. Add your own ideas or the images the client sent on WhatsApp.'
              : 'No venue photos yet. Add photos of the empty hall, stage, walls and entrance.'}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3">
        {shown.map((img, i) => (
          <li key={img.id}>
            <button onClick={() => setOpen(i)} className="group block w-full text-left" aria-label={`Open ${img.caption || 'image'}`}>
              <span className="relative block aspect-4/3 overflow-hidden rounded-xl bg-stone-100">
                <img src={img.thumbnail ?? img.image} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                <SourceBadge image={img} className="absolute top-2 left-2" />
              </span>
              <span className="mt-1 block truncate text-xs text-stone-600">{img.caption || <span className="text-stone-400">No caption</span>}</span>
            </button>
          </li>
        ))}
        {uploading && (
          <li className="grid aspect-4/3 place-items-center rounded-xl bg-stone-100">
            <Spinner className="size-6 text-stone-400" />
          </li>
        )}
      </ul>

      <ImageViewer leadId={leadId} images={shown} index={open} canWrite={canWrite} onChange={setOpen} />
    </div>
  )
}
