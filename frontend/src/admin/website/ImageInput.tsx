import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo } from 'react'

import type { ImageChange } from './cms'

interface Props {
  label: string
  currentUrl: string | null | undefined
  value: ImageChange
  onChange: (change: ImageChange) => void
  required?: boolean
  hint?: string
}

const MAX_MB = 5

export function ImageInput({ label, currentUrl, value, onChange, required, hint }: Props) {
  const id = useId()
  const previewUrl = useMemo(() => (value instanceof File ? URL.createObjectURL(value) : null), [value])
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl])

  const shown = previewUrl ?? (value === null ? null : currentUrl)
  const tooBig = value instanceof File && value.size > MAX_MB * 1024 * 1024

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-stone-700">{label}</p>
      <div className="flex items-center gap-3">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200">
          {shown ? <img src={shown} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-stone-400" />}
        </div>
        <div className="space-y-2 text-sm">
          <label htmlFor={id} className="inline-block cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">
            {shown ? 'Replace image' : 'Choose image'}
          </label>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => onChange(e.target.files?.[0] ?? undefined)}
          />
          {shown && !required && (
            <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-red-600 hover:underline">
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
          <p className="text-xs text-stone-500">{hint ?? `JPG, PNG or WebP, under ${MAX_MB} MB.`}</p>
          {tooBig && <p className="text-xs text-red-600">This image is over {MAX_MB} MB.</p>}
        </div>
      </div>
    </div>
  )
}
