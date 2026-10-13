import { isAxiosError } from 'axios'
import clsx from 'clsx'
import { RefreshCw, Star, Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { apiErrorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'
import { Spinner } from '@/shared/ui/Spinner'

import { compressImage } from '../crm/references/compress'
import { UNCATEGORISED, uploadGalleryImage, useDeleteImage, useGalleryCategories, useGalleryImages, useRefreshGallery, useToggleFeatured, type GalleryImage } from './api'
import { CategoryMenu, type Selection } from './CategoryMenu'

type Tab = 'all' | 'featured' | 'other'

interface UploadState {
  done: number
  total: number
  fraction: number // progress of the current file
  errors: string[]
}

/** "IMG_2041.HEIC" → "IMG_2041" */
const fileStem = (name: string) => name.replace(/\.[^.]+$/, '').trim()

function parseSelection(value: string | null): Selection {
  if (value === 'none') return 'none'
  const id = Number(value)
  return value && Number.isInteger(id) ? id : 'all'
}

export default function GalleryPage() {
  const [params, setParams] = useSearchParams()
  const selected = parseSelection(params.get('category'))
  const categories = useGalleryCategories()
  const images = useGalleryImages()
  const [tab, setTab] = useState<Tab>('all')
  const [upload, setUpload] = useState<UploadState | null>(null)

  const select = (s: Selection) => {
    setParams(s === 'all' ? {} : { category: String(s) }, { replace: true })
    setTab('all')
  }

  // A category deleted elsewhere (or a stale link) falls back to All categories. Wait for any
  // refetch first: a category that was just added isn't in the list until it finishes.
  const category = typeof selected === 'number' ? categories.data?.find((c) => c.id === selected) : undefined
  const missing = typeof selected === 'number' && !!categories.data && !categories.isFetching && !category
  useEffect(() => {
    if (missing) setParams({}, { replace: true })
  }, [missing, setParams])

  const counts = useMemo(() => {
    const byId = new Map<number, number>()
    let none = 0
    for (const img of images.data ?? []) {
      if (img.gallery_category === null) none++
      else byId.set(img.gallery_category, (byId.get(img.gallery_category) ?? 0) + 1)
    }
    return { total: images.data?.length ?? 0, none, byId }
  }, [images.data])

  // The server already sends featured images first.
  const inScope = (images.data ?? []).filter((i) => (selected === 'all' ? true : selected === 'none' ? i.gallery_category === null : i.gallery_category === selected))
  const featured = inScope.filter((i) => i.is_featured)
  const shown = tab === 'featured' ? featured : tab === 'other' ? inScope.filter((i) => !i.is_featured) : inScope
  const scopeName = category?.name ?? (selected === 'none' ? UNCATEGORISED : null)

  const loading = images.isLoading || categories.isLoading
  const error = images.error ?? categories.error

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-3xl font-semibold text-brand-800">Gallery</h1>
        <p className="mt-1 text-sm text-stone-600">Pick a category, upload images into it, and tap the star to feature an image.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <CategoryMenu categories={categories.data ?? []} counts={counts} selected={selected} onSelect={select} />
        {category ? (
          <UploadButton
            categoryId={category.id}
            categoryName={category.name}
            onProgress={(u) => {
              setUpload(u)
              setTab('all') // new images are Non-featured; make sure they're visible
            }}
          />
        ) : (
          <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-600">Choose a category to upload images</p>
        )}
      </div>
      {upload && <UploadProgress upload={upload} onDismiss={() => setUpload(null)} />}

      <div role="tablist" aria-label="Show" className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {(
          [
            ['all', 'All', inScope.length],
            ['featured', '★ Featured', featured.length],
            ['other', 'Non-featured', inScope.length - featured.length],
          ] as const
        ).map(([value, label, n]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={clsx(
              '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap',
              tab === value ? 'border-brand-700 font-medium text-brand-800' : 'border-transparent text-stone-600 hover:text-stone-900',
            )}
          >
            {label}
            <span className="rounded-full bg-stone-100 px-1.5 text-xs text-stone-600 tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className="aspect-4/3 animate-pulse rounded-xl bg-stone-100" />
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
            Couldn't load the gallery. {apiErrorMessage(error)}
            <button
              onClick={() => {
                void images.refetch()
                void categories.refetch()
              }}
              className="ml-2 inline-flex h-11 items-center gap-1 underline"
            >
              <RefreshCw className="size-3.5" /> Try again
            </button>
          </div>
        )}
        {!loading && !error && shown.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-stone-500">
            {tab === 'featured'
              ? 'No featured images here yet. Tap the star on an image to feature it.'
              : tab === 'other' && inScope.length > 0
                ? 'Every image here is featured.'
                : scopeName
                  ? `No images in ${scopeName} yet. Use the upload button to add some.`
                  : 'No images yet. Choose a category to upload some.'}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((img) => (
              <Tile key={img.id} image={img} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tile({ image }: { image: GalleryImage }) {
  const toggle = useToggleFeatured()
  const remove = useDeleteImage()
  const [confirming, setConfirming] = useState(false)
  const name = image.caption || 'Untitled image'
  const btn = 'absolute grid size-11 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 hover:bg-white'

  return (
    <li>
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-stone-100">
        <img src={image.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        <button
          type="button"
          onClick={() => toggle.mutate(image)}
          aria-pressed={image.is_featured}
          aria-label={image.is_featured ? `Remove ${name} from featured` : `Mark ${name} as featured`}
          className={clsx(btn, 'top-2 right-2')}
        >
          <Star className={clsx('size-5', image.is_featured ? 'fill-gold-400 text-gold-500' : 'text-stone-600')} />
        </button>
        {image.is_featured && (
          <span className="absolute bottom-2 left-2 rounded-full bg-brand-900/90 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-white">FEATURED</span>
        )}
        <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${name}`} className={clsx(btn, 'right-2 bottom-2 text-red-600')}>
          <Trash2 className="size-4.5" />
        </button>

        {confirming && (
          <div
            role="alertdialog"
            aria-label={`Delete ${name}?`}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-2 text-center text-white"
            onKeyDown={(e) => e.key === 'Escape' && setConfirming(false)}
          >
            <p className="text-sm font-medium">Delete this image?</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="danger" className="h-11" loading={remove.isPending} onClick={() => remove.mutate(image.id)}>
                Delete
              </Button>
              <Button variant="secondary" className="h-11" autoFocus onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
            {remove.error && <p className="text-xs text-red-200">{apiErrorMessage(remove.error)}</p>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-2 text-xs">
        <p className="min-w-0 truncate font-medium text-stone-800" title={name}>
          {name}
        </p>
        <p className="max-w-[45%] shrink-0 truncate text-right text-stone-500">{image.gallery_category_name ?? UNCATEGORISED}</p>
      </div>
    </li>
  )
}

// --- Uploading -------------------------------------------------------------------------------

// Progress is kept by the page (not the button) so it stays visible after switching categories.
function UploadProgress({ upload, onDismiss }: { upload: UploadState; onDismiss: () => void }) {
  const uploading = upload.done < upload.total
  const pct = Math.round(((upload.done + upload.fraction) / upload.total) * 100)
  return (
    <div aria-live="polite" className="mb-4 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      {uploading ? (
        <>
          <p className="mb-1 flex items-center gap-2 text-xs text-stone-700">
            <Spinner className="size-3.5" /> Uploading {upload.done + 1} of {upload.total} · {pct}%
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-stone-700">
            {upload.total - upload.errors.length} of {upload.total} uploaded.
          </p>
          <button onClick={onDismiss} className="min-h-11 px-2 text-xs text-stone-500 underline">
            Dismiss
          </button>
        </div>
      )}
      {upload.errors.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-700">
          {e}
        </p>
      ))}
    </div>
  )
}

function UploadButton({ categoryId, categoryName, onProgress }: { categoryId: number; categoryName: string; onProgress: (u: UploadState) => void }) {
  const inputId = useId()
  const refresh = useRefreshGallery()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function handleFiles(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (!list.length || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const state: UploadState = { done: 0, total: list.length, fraction: 0, errors: [] }
    const report = () => onProgress({ ...state })
    report()
    // One at a time: steady progress on slow mobile data, and one failure doesn't stop the rest.
    for (const file of list) {
      try {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name}: not an image.`)
        const blob = await compressImage(file)
        await uploadGalleryImage(categoryId, blob, fileStem(file.name), (f) => onProgress({ ...state, fraction: f }))
      } catch (err) {
        state.errors.push(isAxiosError(err) ? `${file.name}: ${apiErrorMessage(err)}` : err instanceof Error ? err.message : file.name)
      }
      state.done += 1
      state.fraction = 0
      report()
      refresh()
    }
    busyRef.current = false
    setBusy(false)
  }

  return (
    <>
      <label
        htmlFor={inputId}
        className={clsx(
          'inline-flex h-11 max-w-full cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <span className="truncate">+ Upload to {categoryName}</span>
      </label>
      {/* No `capture` attribute: phones then offer Photos/Gallery, Camera and Drive. */}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = '' // allow choosing the same files again
        }}
      />
    </>
  )
}
