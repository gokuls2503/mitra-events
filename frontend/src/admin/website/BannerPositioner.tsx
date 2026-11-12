import { Monitor, Move, Smartphone } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export type Point = [number, number]

// Width ÷ height of the real banners, measured on the site: the home hero is much taller than the inner pages'.
const SHAPES = {
  home: { desktop: 1.8, phone: 0.47 },
  page: { desktop: 3, phone: 0.85 },
}

interface Props {
  src: string
  position: Point
  onChange: (position: Point) => void
  shape: keyof typeof SHAPES
}

/** Live desktop and phone previews of a banner; drag either one to choose which part of the photo shows. */
export function BannerPositioner({ src, position, onChange, shape }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const centred = position[0] === 50 && position[1] === 50

  const frame = (ratio: number, className: string) => (
    <Frame src={src} ratio={ratio} position={position} natural={natural} onNatural={setNatural} onChange={onChange} className={className} />
  )

  return (
    <div className="sm:col-span-2">
      <div className="flex max-w-xl items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-1 text-xs text-stone-500">
            <Monitor className="size-3.5" /> Computer
          </p>
          {frame(SHAPES[shape].desktop, 'w-full')}
        </div>
        <div className="shrink-0">
          <p className="mb-1 flex items-center gap-1 text-xs text-stone-500">
            <Smartphone className="size-3.5" /> Phone
          </p>
          {frame(SHAPES[shape].phone, shape === 'home' ? 'w-16' : 'w-24')}
        </div>
      </div>
      <div className="mt-2 flex max-w-xl items-center justify-between gap-3 text-xs text-stone-500">
        <p className="flex items-center gap-1">
          <Move className="size-3.5" /> Drag the photo to choose which part shows. Check both previews before saving.
        </p>
        <button type="button" disabled={centred} onClick={() => onChange([50, 50])} className="shrink-0 text-brand-700 hover:underline disabled:text-stone-400 disabled:no-underline">
          Centre
        </button>
      </div>
    </div>
  )
}

interface FrameProps {
  src: string
  ratio: number
  position: Point
  natural: { w: number; h: number } | null
  onNatural: (size: { w: number; h: number }) => void
  onChange: (position: Point) => void
  className: string
}

function Frame({ src, ratio, position, natural, onNatural, onChange, className }: FrameProps) {
  const drag = useRef<{ x: number; y: number; start: Point } | null>(null)

  // How far the photo spills past the frame, in pixels; only an axis that spills can move.
  const overflow = (el: HTMLElement) => {
    if (!natural) return { x: 0, y: 0 }
    const { width, height } = el.getBoundingClientRect()
    const scale = Math.max(width / natural.w, height / natural.h)
    return { x: natural.w * scale - width, y: natural.h * scale - height }
  }

  const move = (start: Point, dx: number, dy: number, el: HTMLElement) => {
    const spill = overflow(el)
    // Dragging the photo right shows more of its left side, so the position goes down.
    const next = (from: number, delta: number, room: number) => (room > 0 ? clamp(from - (delta / room) * 100) : from)
    onChange([next(start[0], dx, spill.x), next(start[1], dy, spill.y)])
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, start: position }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) move(drag.current.start, e.clientX - drag.current.x, e.clientY - drag.current.y, e.currentTarget)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]
    if (!step) return
    e.preventDefault()
    onChange([clamp(position[0] + step[0]), clamp(position[1] + step[1])])
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Banner photo position. Arrow keys move it."
      aria-valuetext={`${Math.round(position[0])}% across, ${Math.round(position[1])}% down`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKeyDown}
      style={{ aspectRatio: ratio }}
      className={`relative cursor-grab touch-none overflow-hidden rounded-lg bg-stone-900 ring-1 ring-stone-300 select-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none active:cursor-grabbing ${className}`}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(e) => onNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={{ objectPosition: `${position[0]}% ${position[1]}%` }}
        className="pointer-events-none size-full object-cover"
      />
      {/* Same shade as the site's banner, so the preview looks like the real thing. */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/55 via-black/40 to-black/55" />
    </div>
  )
}

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
