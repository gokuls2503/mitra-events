import clsx from 'clsx'
import { Building2, Wine } from 'lucide-react'

/**
 * The Mitra lotus (the client's logo artwork, public/brand/lotus.png).
 * `tone="gold"` is the faint ornament version used in dividers and watermarks.
 */
export function LotusMark({ className, tone = 'full' }: { className?: string; tone?: 'full' | 'gold' }) {
  return (
    <img
      src="/brand/lotus.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={clsx('select-none', tone === 'gold' && 'opacity-70 saturate-50', className)}
    />
  )
}

/** Lotus + "Mitra Events / management" wordmark, laid out as on the card. */
/** `light` is for dark backgrounds, e.g. the navbar over the home page photo. */
export function Logo({ size = 'md', light, className }: { size?: 'md' | 'lg'; light?: boolean; className?: string }) {
  const lg = size === 'lg'
  return (
    <span className={clsx('inline-flex items-center gap-2.5', lg && 'flex-col gap-1 text-center', className)}>
      <LotusMark className={lg ? 'h-16 w-auto' : 'h-9 w-auto shrink-0'} />
      <span className="leading-none">
        <span className={clsx('block font-display font-bold', light ? 'text-gold-300' : 'text-gold-600', lg ? 'text-5xl' : 'text-[1.6rem]')}>Mitra Events</span>
        <span
          className={clsx(
            'block font-light lowercase', light ? 'text-white' : 'text-brand-700',
            lg ? 'mt-1 text-2xl tracking-[0.18em]' : 'mt-0.5 text-[0.8rem] tracking-[0.22em]',
          )}
        >
          management
        </span>
      </span>
    </span>
  )
}

/** "———— ✿ ————" — the gold rule-and-lotus ornament from the card. */
export function LotusDivider({ className }: { className?: string }) {
  return (
    <span className={clsx('flex items-center justify-center gap-3', className)} aria-hidden="true">
      <span className="h-px w-12 bg-linear-to-r from-transparent to-gold-500 sm:w-20" />
      <LotusMark tone="gold" className="h-4 w-auto" />
      <span className="h-px w-12 bg-linear-to-l from-transparent to-gold-500 sm:w-20" />
    </span>
  )
}

function RingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="9" cy="14" r="6" />
      <circle cx="15" cy="14" r="6" />
      <path d="m10.5 5 1.5-2 1.5 2-1.5 1.5Z" />
    </svg>
  )
}

const EVENT_TYPES = [
  { label: 'Weddings', Icon: RingsIcon },
  { label: 'Corporate Events', Icon: Building2 },
  { label: 'Parties', Icon: Wine },
]

/** "Weddings | Corporate Events | Parties", as along the bottom of the card. */
export function EventTypesLine({ className }: { className?: string }) {
  return (
    <ul className={clsx('flex flex-wrap items-center gap-x-4 gap-y-2 font-caps text-xs tracking-[0.18em] text-brand-800 uppercase sm:text-sm', className)}>
      {EVENT_TYPES.map(({ label, Icon }, i) => (
        <li key={label} className="flex items-center gap-4">
          {/* Dividers only where the three fit on one line; on phones they'd start a wrapped row. */}
          {i > 0 && <span className="hidden h-5 w-px bg-gold-400 sm:block" aria-hidden="true" />}
          <span className="flex items-center gap-2">
            <Icon className="size-5 text-gold-600" />
            {label}
          </span>
        </li>
      ))}
    </ul>
  )
}
