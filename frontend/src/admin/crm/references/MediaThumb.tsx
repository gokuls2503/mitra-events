import clsx from 'clsx'
import { Play } from 'lucide-react'

import type { LeadImage } from './api'

/** A photo's thumbnail, or a video's cover frame with a play mark (a dark tile if it has no cover). */
export function MediaThumb({ item, className }: { item: LeadImage; className?: string }) {
  const src = item.thumbnail ?? item.image
  return (
    <span className={clsx('relative block overflow-hidden', item.video ? 'bg-stone-800' : 'bg-stone-100', className)}>
      {src && <img src={src} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />}
      {item.video && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-9 place-items-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </span>
      )}
    </span>
  )
}

/** "3 photos · 1 video" */
export function mediaCount(items: LeadImage[]) {
  const videos = items.filter((i) => i.video).length
  const photos = items.length - videos
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (!videos) return part(photos, 'photo')
  if (!photos) return part(videos, 'video')
  return `${part(photos, 'photo')} · ${part(videos, 'video')}`
}
