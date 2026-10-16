import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { fmtDMY, MONTHS, parseDMY, toISODate, todayISO } from '@/shared/dates'

import { CONTROL } from './Field'

const WEEKDAYS = [
  ['S', 'Sunday'],
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
] as const

interface Props {
  label: string
  /** "YYYY-MM-DD", or "" for no date. */
  value: string
  onChange: (iso: string) => void
  onBlur?: () => void
  required?: boolean
  disabled?: boolean
  /** Earliest / latest allowed date, "YYYY-MM-DD". */
  min?: string
  max?: string
  hint?: string
  error?: string
  /** Visually hide the label (it stays for screen readers). */
  hideLabel?: boolean
  /** Smaller label and box, for filter bars with small controls. */
  compact?: boolean
  className?: string
  id?: string
}

/**
 * The admin's date field. Shows and accepts DD/MON/YYYY (01/DEC/2026) — the month is always a
 * name, never a number — with a calendar popup below. The value it reports is "YYYY-MM-DD".
 */
export function DateField({ label, value, onChange, onBlur, required, disabled, min, max, hint, error, hideLabel, compact, className, id }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  const wrapper = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(fmtDMY(value))
  const [typingError, setTypingError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Follow outside changes (form reset, defaults loading) unless the person is mid-typing.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(fmtDMY(value))
    setTypingError(null)
  }

  const outOfRange = (iso: string) => (min && iso < min ? `Pick ${fmtDMY(min)} or later.` : max && iso > max ? `Pick ${fmtDMY(max)} or earlier.` : null)

  // The browser blocks submitting while the typed text isn't a usable date.
  useEffect(() => {
    input.current?.setCustomValidity(typingError ?? '')
  }, [typingError])

  /** Turns what was typed into a date; called on blur and Enter. */
  const commit = () => {
    if (!text.trim()) {
      setTypingError(null)
      if (value) onChange('')
      return
    }
    const iso = parseDMY(text)
    const problem = iso ? outOfRange(iso) : 'Use DD/MON/YYYY, e.g. 01/DEC/2026.'
    setTypingError(problem)
    if (iso && !problem) {
      setText(fmtDMY(iso))
      if (iso !== value) onChange(iso)
    }
  }

  const pick = (iso: string) => {
    setText(fmtDMY(iso))
    setTypingError(null)
    onChange(iso)
    setOpen(false)
    input.current?.focus()
  }

  // A click or tap outside closes the popup without changing anything.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    // Inside a modal, Chrome turns Esc into the dialog's `cancel` event (a key handler can't stop
    // it), so while the calendar is open, Esc closes only the calendar.
    const dialog = wrapper.current?.closest('dialog')
    const onCancel = (e: Event) => {
      e.preventDefault()
      setOpen(false)
      input.current?.focus()
    }
    dialog?.addEventListener('cancel', onCancel)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      dialog?.removeEventListener('cancel', onCancel)
    }
  }, [open])

  const shownError = error ?? typingError
  return (
    <div
      ref={wrapper}
      className={clsx('relative', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          // Close just the calendar, not the dialog the field sits in.
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
          input.current?.focus()
        }
      }}
    >
      <label
        htmlFor={inputId}
        className={clsx(compact ? 'mb-0.5 block text-xs text-stone-600' : 'mb-1 block text-sm font-medium text-stone-700', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="DD/MON/YYYY"
          value={text}
          required={required}
          disabled={disabled}
          aria-invalid={!!shownError}
          aria-describedby={shownError ? `${inputId}-err` : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setText(e.target.value.toUpperCase())
            setTypingError(null)
          }}
          onBlur={() => {
            commit()
            onBlur?.()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault()
              setOpen(true)
            }
          }}
          className={clsx(CONTROL, 'pr-11 uppercase tabular-nums', compact && 'py-1.5', shownError && 'border-red-400')}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`Open calendar for ${label}`}
          onClick={() => setOpen((o) => !o)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-stone-500 hover:text-brand-700"
        >
          <CalendarDays className="size-[1.1rem]" />
        </button>
      </div>
      {shownError ? (
        <p id={`${inputId}-err`} className="mt-1 text-xs text-red-600">
          {shownError}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>
      )}
      {open && <Calendar label={label} value={value} min={min} max={max} onPick={pick} onCancel={() => setOpen(false)} />}
    </div>
  )
}

function Calendar({
  label,
  value,
  min,
  max,
  onPick,
  onCancel,
}: {
  label: string
  value: string
  min?: string
  max?: string
  onPick: (iso: string) => void
  onCancel: () => void
}) {
  const today = todayISO()
  const start = value || (min && min > today ? min : today)
  const [focused, setFocused] = useState(start)
  const [view, setView] = useState(() => ({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) - 1 }))
  const grid = useRef<HTMLDivElement>(null)
  const focusOnRender = useRef(false)

  // Keyboard focus follows the highlighted day after arrow keys move it.
  useEffect(() => {
    if (!focusOnRender.current) return
    focusOnRender.current = false
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  })

  const shiftMonth = (by: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + by, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const disabledDay = (iso: string) => (!!min && iso < min) || (!!max && iso > max)
  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(view.year, view.month, i + 1)))
  const heading = `${MONTHS[view.month]} ${view.year}`
  // One day in the grid is reachable with Tab: the highlighted one, or the 1st after ‹ ›.
  const tabbable = days.includes(focused) ? focused : days[0]

  const onGridKey = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const [y, m, d] = focused.split('-').map(Number)
    const next = new Date(y, m - 1, d + step)
    setFocused(toISODate(next))
    setView({ year: next.getFullYear(), month: next.getMonth() })
    focusOnRender.current = true
  }

  const navBtn = 'grid size-9 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50'
  return (
    <div role="dialog" aria-label={`Choose ${label}`} className="absolute top-full left-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-stone-200">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className={navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold tracking-wide text-brand-800" aria-live="polite">
          {heading}
        </p>
        <button type="button" className={navBtn} onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={heading} className="grid grid-cols-7 gap-y-1 text-center" onKeyDown={onGridKey}>
        {WEEKDAYS.map(([letter, name], i) => (
          <span key={i} role="columnheader" aria-label={name} className="pb-1 text-[0.7rem] font-medium text-stone-400">
            {letter}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((iso) => {
          const day = Number(iso.slice(8))
          const selected = iso === value
          const off = disabledDay(iso)
          return (
            <button
              key={iso}
              type="button"
              data-day={iso}
              disabled={off}
              tabIndex={iso === tabbable ? 0 : -1}
              aria-label={fmtDMY(iso)}
              aria-pressed={selected}
              onClick={() => onPick(iso)}
              className={clsx(
                'mx-auto grid size-10 place-items-center rounded-lg text-sm tabular-nums',
                selected ? 'bg-brand-800 font-semibold text-white' : 'text-stone-700 hover:bg-brand-50',
                !selected && iso === today && 'font-semibold text-brand-700 ring-1 ring-brand-200',
                off && 'cursor-not-allowed text-stone-300 hover:bg-transparent',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 px-2 text-sm text-stone-500 hover:text-stone-800">
          Cancel
        </button>
      </div>
    </div>
  )
}
