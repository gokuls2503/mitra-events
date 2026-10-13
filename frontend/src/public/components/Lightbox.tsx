import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import type { GalleryImage } from '../api'

interface Props {
  images: GalleryImage[]
  index: number | null
  onChange: (index: number | null) => void
}

export function Lightbox({ images, index, onChange }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = index !== null && images[index] !== undefined

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onChange(((index ?? 0) + 1) % images.length)
      if (e.key === 'ArrowLeft') onChange(((index ?? 0) - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, images.length, onChange])

  const img = open ? images[index!] : null

  return (
    <dialog
      ref={ref}
      onClose={() => onChange(null)}
      aria-label="Image viewer"
      className="m-0 h-full max-h-none w-full max-w-none bg-black/90 p-0 backdrop:bg-black/80"
    >
      {img && (
        <div className="relative flex h-full flex-col items-center justify-center p-4 sm:p-12">
          <button
            onClick={() => onChange(null)}
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-6" />
          </button>
          {images.length > 1 && (
            <>
              <button
                onClick={() => onChange((index! - 1 + images.length) % images.length)}
                aria-label="Previous image"
                className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-6"
              >
                <ChevronLeft className="size-7" />
              </button>
              <button
                onClick={() => onChange((index! + 1) % images.length)}
                aria-label="Next image"
                className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-6"
              >
                <ChevronRight className="size-7" />
              </button>
            </>
          )}
          <AnimatePresence mode="wait">
            <motion.img
              key={img.id}
              src={img.image}
              alt={img.alt_text || img.caption}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />
          </AnimatePresence>
          <p className="mt-4 text-center text-sm text-white/80">
            {img.caption} <span className="text-white/50">· {img.category_label}</span>
          </p>
        </div>
      )}
    </dialog>
  )
}
