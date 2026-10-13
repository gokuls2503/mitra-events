import clsx from 'clsx'

import type { LeadImage } from './api'

/** "From client" / "Ours" badge on Design images (Stage images have none). */
export function SourceBadge({ image, className }: { image: Pick<LeadImage, 'section' | 'source'>; className?: string }) {
  if (image.section !== 'design') return null
  const client = image.source === 'client'
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold text-white',
        client ? 'bg-green-700' : 'bg-brand-700',
        className,
      )}
    >
      {client ? 'From client' : 'Ours'}
    </span>
  )
}
