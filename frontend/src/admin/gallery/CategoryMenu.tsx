import { isAxiosError } from 'axios'
import clsx from 'clsx'
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { apiErrorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'

import { UNCATEGORISED, useAddCategory, useDeleteCategory, useRenameCategory, type GalleryCategory } from './api'

/** 'all' = every image, 'none' = Uncategorised, otherwise a category id. */
export type Selection = 'all' | 'none' | number

const RESERVED = ['uncategorised', 'uncategorized', 'all categories']

/** Same rules as the server, checked first so the message appears without a round trip. */
function nameProblem(raw: string, categories: GalleryCategory[], exceptId?: number) {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return 'Enter a category name.'
  if (RESERVED.includes(name.toLowerCase())) return `“${name}” is a reserved name. Pick another one.`
  const clash = categories.find((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase())
  if (clash) return `A category named “${clash.name}” already exists.`
  return null
}

/** The server's message for the name field, without the "name:" prefix. */
function serverNameError(error: unknown) {
  if (isAxiosError(error)) {
    const msg = (error.response?.data as { name?: string[] } | undefined)?.name?.[0]
    if (msg) return msg
  }
  return apiErrorMessage(error)
}

const ROW = 'flex min-h-11 items-center gap-1 rounded-lg px-1'
const ICON_BTN = 'grid size-11 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100'

interface Props {
  categories: GalleryCategory[]
  counts: { total: number; none: number; byId: Map<number, number> }
  selected: Selection
  onSelect: (s: Selection) => void
}

export function CategoryMenu({ categories, counts, selected, onSelect }: Props) {
  const labelId = useId()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const close = (focusTrigger = false) => {
    setOpen(false)
    setEditing(null)
    setDeleting(null)
    if (focusTrigger) trigger.current?.focus()
  }

  // Close on a click/tap outside, or Esc.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (s: Selection) => {
    onSelect(s)
    close(true)
  }

  const selectedName =
    selected === 'all' ? 'All categories' : selected === 'none' ? UNCATEGORISED : (categories.find((c) => c.id === selected)?.name ?? 'All categories')

  return (
    <div ref={wrapper} className="relative w-full sm:w-80">
      <p id={labelId} className="mb-1 text-xs font-medium text-stone-600">
        Category
      </p>
      <button
        ref={trigger}
        type="button"
        aria-labelledby={labelId}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 text-left text-sm font-medium text-stone-900 hover:border-stone-400 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDown className={clsx('size-4 shrink-0 text-stone-500 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-[min(24rem,calc(100vw-2rem))] rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-stone-200" aria-label="Categories">
          <ul className="max-h-[60vh] overflow-y-auto">
            <li className={ROW}>
              <SelectRow name="All categories" count={counts.total} active={selected === 'all'} onClick={() => choose('all')} bold />
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                {editing === c.id ? (
                  <RenameRow category={c} categories={categories} onDone={() => setEditing(null)} />
                ) : deleting === c.id ? (
                  <DeleteRow
                    category={c}
                    count={counts.byId.get(c.id) ?? 0}
                    onCancel={() => setDeleting(null)}
                    onDeleted={() => {
                      setDeleting(null)
                      if (selected === c.id) onSelect('all')
                    }}
                  />
                ) : (
                  <div className={ROW}>
                    <SelectRow name={c.name} count={counts.byId.get(c.id) ?? 0} active={selected === c.id} onClick={() => choose(c.id)} />
                    <button type="button" className={ICON_BTN} aria-label={`Rename ${c.name}`} onClick={() => setEditing(c.id)}>
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" className={clsx(ICON_BTN, 'text-red-600 hover:bg-red-50')} aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
            {/* Only shown when it has something in it; can't be renamed or deleted. */}
            {counts.none > 0 && (
              <li className={ROW}>
                <SelectRow name={UNCATEGORISED} count={counts.none} active={selected === 'none'} onClick={() => choose('none')} muted />
              </li>
            )}
          </ul>
          <AddRow
            categories={categories}
            onAdded={(c) => {
              onSelect(c.id)
              close(true)
            }}
          />
        </div>
      )}
    </div>
  )
}

function SelectRow({ name, count, active, onClick, bold, muted }: { name: string; count: number; active: boolean; onClick: () => void; bold?: boolean; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={clsx(
        'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-sm',
        active ? 'bg-brand-50 text-brand-900' : 'hover:bg-stone-50',
        bold && 'font-semibold',
        muted && 'text-stone-500 italic',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {active && <Check className="size-4 shrink-0 text-brand-700" />}
      <span className="shrink-0 text-xs text-stone-500 tabular-nums">{count}</span>
    </button>
  )
}

function RenameRow({ category, categories, onDone }: { category: GalleryCategory; categories: GalleryCategory[]; onDone: () => void }) {
  const [name, setName] = useState(category.name)
  const [problem, setProblem] = useState<string | null>(null)
  const rename = useRenameCategory()
  return (
    <form
      className="space-y-1.5 rounded-lg bg-stone-50 p-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const p = nameProblem(name, categories, category.id)
        setProblem(p)
        if (!p) rename.mutate({ id: category.id, name }, { onSuccess: onDone })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation() // cancel the rename, keep the menu open
          onDone()
        }
      }}
    >
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={name}
          maxLength={60}
          aria-label={`New name for ${category.name}`}
          onChange={(e) => {
            setName(e.target.value)
            setProblem(null)
          }}
          className="h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        <Button type="submit" className="h-11 px-3" loading={rename.isPending}>
          Save
        </Button>
        <Button type="button" variant="secondary" className="h-11 px-3" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {(problem || rename.error) && (
        <p role="alert" className="px-1 text-xs text-red-700">
          {problem ?? serverNameError(rename.error)}
        </p>
      )}
    </form>
  )
}

function DeleteRow({ category, count, onCancel, onDeleted }: { category: GalleryCategory; count: number; onCancel: () => void; onDeleted: () => void }) {
  const remove = useDeleteCategory()
  return (
    <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-2.5 text-sm">
      <p className="font-medium text-red-900">Delete “{category.name}”?</p>
      {count > 0 && (
        <p className="text-xs text-red-800">
          Its {count} image{count === 1 ? '' : 's'} will move to {UNCATEGORISED}.
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="danger" className="h-11" loading={remove.isPending} onClick={() => remove.mutate(category.id, { onSuccess: onDeleted })}>
          Delete
        </Button>
        <Button variant="secondary" className="h-11" autoFocus onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {remove.error && <p className="text-xs text-red-700">{apiErrorMessage(remove.error)}</p>}
    </div>
  )
}

function AddRow({ categories, onAdded }: { categories: GalleryCategory[]; onAdded: (c: GalleryCategory) => void }) {
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const add = useAddCategory()
  return (
    <form
      className="mt-1 border-t border-stone-100 pt-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const p = nameProblem(name, categories)
        setProblem(p)
        if (!p) add.mutate(name, { onSuccess: onAdded })
      }}
    >
      <div className="flex gap-1.5">
        <input
          value={name}
          maxLength={60}
          aria-label="New category name"
          placeholder="New category, e.g. Baby shower"
          onChange={(e) => {
            setName(e.target.value)
            setProblem(null)
            add.reset()
          }}
          className="h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        <Button type="submit" className="h-11 px-3" loading={add.isPending}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      {(problem || add.error) && (
        <p role="alert" className="mt-1 px-1 text-xs text-red-700">
          {problem ?? serverNameError(add.error)}
        </p>
      )}
    </form>
  )
}
