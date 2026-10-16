import clsx from 'clsx'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { CONTROL } from './Field'

interface Props {
  label: string
  options: { value: string; label: string }[]
  /** Picked values, in the order they were picked. */
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

/**
 * A dropdown where several options can be ticked. The box lists the picks in the order they
 * were made ("Engagement, Wedding, Birthday"); unticking one removes it from that order.
 */
export function MultiSelectField({ label, options, value, onChange, placeholder = '—', className }: Props) {
  const id = useId()
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const summary = value.map(labelOf).join(', ')
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  // Click outside closes; inside a modal, Esc closes only this list (see DateField).
  useEffect(() => {
    if (!open) return
    list.current?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    const dialog = wrapper.current?.closest('dialog')
    const onCancel = (e: Event) => {
      e.preventDefault()
      close()
    }
    document.addEventListener('pointerdown', onPointer)
    dialog?.addEventListener('cancel', onCancel)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      dialog?.removeEventListener('cancel', onCancel)
    }
  }, [open])

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      toggle(options[active].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapper} className={clsx('relative', className)}>
      <p id={`${id}-label`} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </p>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={clsx(CONTROL, 'flex items-center justify-between gap-2 text-left')}
      >
        <span id={`${id}-value`} className={clsx('min-w-0 truncate', !summary && 'text-stone-500')} title={summary || undefined}>
          {summary || placeholder}
        </span>
        <ChevronDown className={clsx('size-4 shrink-0 text-stone-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          tabIndex={-1}
          onKeyDown={onListKey}
          className="absolute top-full left-0 z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl bg-white p-1 shadow-xl ring-1 ring-stone-200 focus:outline-none"
        >
          {options.map((o, i) => {
            const picked = value.includes(o.value)
            return (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={picked}
                onMouseDown={(e) => e.preventDefault()} // keep focus on the list
                onClick={() => {
                  setActive(i)
                  toggle(o.value)
                }}
                className={clsx(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm',
                  i === active ? 'bg-brand-50' : 'hover:bg-stone-50',
                  picked && 'font-medium text-brand-800',
                )}
              >
                <span
                  className={clsx(
                    'grid size-5 shrink-0 place-items-center rounded border',
                    picked ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white',
                  )}
                  aria-hidden="true"
                >
                  {picked && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="flex-1">{o.label}</span>
                {/* Where this one sits in the picked order. */}
                {picked && value.length > 1 && <span className="text-xs text-stone-400 tabular-nums">{value.indexOf(o.value) + 1}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
