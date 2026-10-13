import { ArrowRightLeft, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/shared/ui/Button'

import { FormError } from '../../kit'
import { useDeleteImage, useUpdateImage, type LeadImage } from './api'
import { SourceBadge } from './SourceBadge'

interface Props {
  leadId: number
  images: LeadImage[]
  index: number | null
  canWrite: boolean
  onChange: (index: number | null) => void
}

/** Full-screen image with caption editing, delete, and move between Design and Stage. */
export function ImageViewer({ leadId, images, index, canWrite, onChange }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const img = index !== null ? images[index] : undefined
  const open = !!img

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (!open || images.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowRight') onChange(((index ?? 0) + 1) % images.length)
      if (e.key === 'ArrowLeft') onChange(((index ?? 0) - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, images.length, onChange])

  return (
    <dialog
      ref={ref}
      onClose={(e) => e.target === e.currentTarget && onChange(null)}
      aria-label="Image"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      {img && (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 p-2">
            <SourceBadge image={img} />
            <span className="text-sm text-white/70">
              {index! + 1} / {images.length}
            </span>
            <button onClick={() => onChange(null)} aria-label="Close" className="ml-auto grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            <img src={img.image} alt={img.caption || 'Reference image'} className="max-h-full max-w-full object-contain" />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => onChange((index! - 1 + images.length) % images.length)}
                  aria-label="Previous image"
                  className="absolute left-2 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  onClick={() => onChange((index! + 1) % images.length)}
                  aria-label="Next image"
                  className="absolute right-2 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          {/* Keyed by image so the caption box resets when moving between images. */}
          <ViewerControls key={img.id} leadId={leadId} image={img} canWrite={canWrite} onRemoved={() => onChange(null)} />
        </div>
      )}
    </dialog>
  )
}

function ViewerControls({ leadId, image, canWrite, onRemoved }: { leadId: number; image: LeadImage; canWrite: boolean; onRemoved: () => void }) {
  const [caption, setCaption] = useState(image.caption)
  const [confirming, setConfirming] = useState(false)
  const update = useUpdateImage(leadId)
  const remove = useDeleteImage(leadId)
  const other = image.section === 'design' ? 'stage' : 'design'

  if (!canWrite) {
    return image.caption ? <p className="p-4 text-center text-sm">{image.caption}</p> : <div className="h-4" />
  }
  return (
    <div className="space-y-3 bg-black/60 p-3 sm:p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ id: image.id, caption })
        }}
      >
        <label className="sr-only" htmlFor={`cap-${image.id}`}>
          Caption
        </label>
        <input
          id={`cap-${image.id}`}
          value={caption}
          maxLength={200}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          className="h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-white/50 focus:border-white/50 focus:outline-none"
        />
        <Button type="submit" className="h-11" disabled={caption === image.caption} loading={update.isPending}>
          Save
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => update.mutate({ id: image.id, section: other }, { onSuccess: onRemoved })}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20"
        >
          <ArrowRightLeft className="size-4" /> Move to {other === 'stage' ? 'Stage' : 'Design'}
        </button>
        {image.section === 'design' && (
          <button
            onClick={() => update.mutate({ id: image.id, source: image.source === 'client' ? 'ours' : 'client' })}
            className="inline-flex h-11 items-center rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20"
          >
            Mark as {image.source === 'client' ? 'our reference' : 'from client'}
          </button>
        )}
        {confirming ? (
          <span className="ml-auto flex items-center gap-2">
            <Button variant="danger" className="h-11" loading={remove.isPending} onClick={() => remove.mutate(image.id, { onSuccess: onRemoved })}>
              Delete image
            </Button>
            <button onClick={() => setConfirming(false)} className="h-11 rounded-lg px-3 text-sm hover:bg-white/10">
              Keep
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} className="ml-auto inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-red-300 hover:bg-white/10">
            <Trash2 className="size-4" /> Delete
          </button>
        )}
      </div>
      <FormError error={update.error ?? remove.error} />
    </div>
  )
}
