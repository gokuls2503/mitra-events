import clsx from 'clsx'
import { Building2, Wine } from 'lucide-react'
import { useId } from 'react'

/** Gradient ids must be unique per instance (the logo appears in header and footer). */
function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * The lotus from the visiting card: purple base petals, gold side petals, orchid centre.
 * `tone="gold"` draws it in gold only (dividers, watermarks).
 */
export function LotusMark({ className, tone = 'full' }: { className?: string; tone?: 'full' | 'gold' }) {
  const id = useSvgId()
  const gold = `url(#${id}-gold)`
  const purple = tone === 'gold' ? gold : `url(#${id}-purple)`
  const orchid = tone === 'gold' ? gold : `url(#${id}-orchid)`
  return (
    <svg viewBox="0 0 120 76" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ecd189" />
          <stop offset="0.5" stopColor="#c39539" />
          <stop offset="1" stopColor="#a27a26" />
        </linearGradient>
        <linearGradient id={`${id}-purple`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#632d8c" />
          <stop offset="0.5" stopColor="#a63ba3" />
          <stop offset="1" stopColor="#632d8c" />
        </linearGradient>
        <linearGradient id={`${id}-orchid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0a6d6" />
          <stop offset="1" stopColor="#c4449f" />
        </linearGradient>
      </defs>
      {/* Centre petal */}
      <path d="M60 4c9 11 12 24 0 42C48 28 51 15 60 4Z" fill={orchid} />
      {/* Gold side petals */}
      <path d="M57 55C42 50 31 38 30 17c14 4 25 16 27 38Z" fill="none" stroke={gold} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M63 55c15-5 26-17 27-38-14 4-25 16-27 38Z" fill="none" stroke={gold} strokeWidth="4.5" strokeLinejoin="round" />
      {/* Purple base petals */}
      <path d="M58 70C38 70 17 60 6 42c22 3 41 12 52 28Z" fill="none" stroke={purple} strokeWidth="5" strokeLinejoin="round" />
      <path d="M62 70c20 0 41-10 52-28-22 3-41 12-52 28Z" fill="none" stroke={purple} strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}

/** Lotus + "Mitra Events / management" wordmark, laid out as on the card. */
export function Logo({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  const lg = size === 'lg'
  return (
    <span className={clsx('inline-flex items-center gap-2.5', lg && 'flex-col gap-1 text-center', className)}>
      <LotusMark className={lg ? 'h-16 w-auto' : 'h-9 w-auto shrink-0'} />
      <span className="leading-none">
        <span className={clsx('block font-display font-bold text-gold-600', lg ? 'text-5xl' : 'text-[1.6rem]')}>Mitra Events</span>
        <span
          className={clsx(
            'block font-light text-brand-700 lowercase',
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

/**
 * The card's corner swoosh: a deep purple band edged with gold ribbons.
 * Place inside a `relative overflow-hidden` parent.
 */
export function CornerSwoosh({ corner, size = 'md', className }: { corner: 'top-left' | 'bottom-right'; size?: 'sm' | 'md'; className?: string }) {
  const id = useSvgId()
  return (
    <svg
      viewBox="0 0 320 220"
      aria-hidden="true"
      focusable="false"
      className={clsx(
        'pointer-events-none absolute h-auto',
        size === 'sm' ? 'w-32 sm:w-44 lg:w-52' : 'w-44 sm:w-64 lg:w-80',
        corner === 'top-left' ? 'top-0 left-0' : 'right-0 bottom-0 rotate-180',
        className,
      )}
    >
      <defs>
        <linearGradient id={`${id}-band`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f1a5e" />
          <stop offset="1" stopColor="#7a3ea6" />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#a27a26" />
          <stop offset="0.5" stopColor="#ecd189" />
          <stop offset="1" stopColor="#c39539" />
        </linearGradient>
      </defs>
      <path d="M0 0h230C160 22 92 70 0 150Z" fill={`url(#${id}-band)`} opacity="0.92" />
      <path d="M0 176C78 92 170 34 300 0" fill="none" stroke={`url(#${id}-ribbon)`} strokeWidth="5" strokeLinecap="round" />
      <path d="M0 198C92 110 196 48 320 14" fill="none" stroke={`url(#${id}-ribbon)`} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </svg>
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
