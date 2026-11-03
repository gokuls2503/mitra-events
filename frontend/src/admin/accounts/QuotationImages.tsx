import { ImagePlus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { MAX_QUOTATION_IMAGES, type PhotoDraft } from './quotationPhotos'

/** Up to five photos for the quotation PDF, printed in this order. */
export function QuotationImages({ value, onChange }: { value: PhotoDraft[]; onChange: (v: PhotoDraft[]) => void }) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)

  // Free the local previews of picked files when the editor closes.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  useEffect(() => () => latest.current.forEach((p) => p.file && URL.revokeObjectURL(p.url)), [])

  const add = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    const room = MAX_QUOTATION_IMAGES - value.length
    setError(picked.length > room ? `Only ${MAX_QUOTATION_IMAGES} images can go on a quotation.` : null)
    onChange([
      ...value,
      ...picked.slice(0, room).map((file, n) => ({ key: `new-${Date.now()}-${n}`, url: URL.createObjectURL(file), file })),
    ])
  }

  const remove = (p: PhotoDraft) => {
    if (p.file) URL.revokeObjectURL(p.url)
    setError(null)
    onChange(value.filter((x) => x.key !== p.key))
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-3">
        <h2 className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Images</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          Up to {MAX_QUOTATION_IMAGES}, printed in this order under the client details on the quotation.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {value.map((p, n) => (
          <figure key={p.key} className="relative overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200">
            <img src={p.url} alt={`Quotation image ${n + 1}`} className="aspect-[16/9] w-full object-cover" />
            <figcaption className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
              {n + 1}
              {p.file && ' · not saved yet'}
            </figcaption>
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label={`Remove image ${n + 1}`}
              className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-white/95 text-red-600 shadow-sm hover:bg-white"
            >
              <X className="size-4" />
            </button>
          </figure>
        ))}
        {value.length < MAX_QUOTATION_IMAGES && (
          <label
            htmlFor={inputId}
            className="flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-300 text-sm text-stone-600 hover:border-brand-400 hover:bg-brand-50"
          >
            <ImagePlus className="size-6 text-stone-400" />
            Add image
            <span className="text-xs text-stone-400">{MAX_QUOTATION_IMAGES - value.length} more allowed</span>
          </label>
        )}
      </div>
      {/* No `capture`: phones offer Photos, Camera and Drive. */}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
    </section>
  )
}
