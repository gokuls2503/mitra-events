import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { UNCATEGORISED, type GalleryImage } from './api'

interface Props {
  images: GalleryImage[]
  index: number | null
  onChange: (index: number | null) => void
}

/** Full-screen look at a gallery image as uploaded (watermark included), with arrows to move through the list. */
export function GalleryPreview({ images, index, onChange }: Props) {
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
      aria-label="Image preview"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      {img && (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 p-2">
            <span className="text-sm text-white/70">
              {index! + 1} / {images.length}
            </span>
            <button onClick={() => onChange(null)} aria-label="Close" className="ml-auto grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            <img src={img.image} alt={img.caption || 'Gallery image'} className="max-h-full max-w-full object-contain" />
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
          <p className="p-4 text-center text-sm">
            {img.caption || 'Untitled image'}
            <span className="text-white/60"> · {img.gallery_category_name ?? UNCATEGORISED}</span>
            {img.is_featured && <span className="text-gold-300"> · Featured</span>}
          </p>
        </div>
      )}
    </dialog>
  )
}
