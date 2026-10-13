import clsx from 'clsx'
import { Plus, RefreshCw, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { apiErrorMessage } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/useAuth'
import { formatAmount } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { FormError } from '../../kit'
import {
  unitOptions,
  useAddItem,
  useDeleteItem,
  useLeadItems,
  useMaterialChoices,
  useMaterials,
  useSaveToMaterials,
  useUpdateItem,
  type Category,
  type LeadItem,
  type Material,
} from './api'

const INPUT = 'h-11 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none'

const amountOf = (qty: string, rate: string) => Math.round((Number(qty) || 0) * (Number(rate) || 0) * 100) / 100

export function ItemsTab({ leadId, canWrite }: { leadId: number; canWrite: boolean }) {
  const { hasRole } = useAuth()
  const canSaveToMaterials = canWrite && hasRole('OWNER', 'MANAGER')
  const { data, isLoading, error, refetch } = useLeadItems(leadId)
  const [saving, setSaving] = useState<LeadItem | null>(null)
  // Local edits so amounts and the total update instantly while saves happen in the background.
  const [edits, setEdits] = useState<Record<number, { qty: string; rate: string }>>({})

  const rows = (data?.items ?? []).map((i) => ({ ...i, ...edits[i.id] }))
  const total = rows.reduce((sum, r) => sum + amountOf(r.qty, r.rate), 0)

  return (
    <div className="space-y-4">
      {canWrite && <AddItemForm leadId={leadId} />}

      {isLoading && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-14 animate-pulse rounded-lg bg-stone-100" />
          ))}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          Couldn't load items. {apiErrorMessage(error)}
          <button onClick={() => refetch()} className="ml-2 inline-flex h-11 items-center gap-1 underline">
            <RefreshCw className="size-3.5" /> Try again
          </button>
        </div>
      )}
      {data && rows.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
          No materials yet. Add flowers, drapes, lights and other items this decoration needs.
        </div>
      )}

      {rows.length > 0 && (
        <div>
          {/* Column headings only on wider screens; on phones each row stacks. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6.5rem_6rem_2.75rem] gap-2 border-b border-stone-200 pb-2 text-xs font-medium text-stone-500 sm:grid">
            <span>Item</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Rate (₹)</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <ItemRow
                key={r.id}
                leadId={leadId}
                item={r}
                canWrite={canWrite}
                onSaveToMaterials={canSaveToMaterials ? () => setSaving(r) : undefined}
                onLocalChange={(v) => setEdits((e) => ({ ...e, [r.id]: v }))}
              />
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-end gap-4 border-t border-stone-200 pt-3">
            <span className="text-sm text-stone-600">Materials total</span>
            <span className="font-display text-2xl font-semibold text-stone-900">{formatAmount(total)}</span>
          </div>
        </div>
      )}

      <Modal open={saving !== null} title="Save to Materials" onClose={() => setSaving(null)}>
        {saving && <SaveToMaterialsForm leadId={leadId} item={saving} onDone={() => setSaving(null)} />}
      </Modal>
    </div>
  )
}

function ItemRow({
  leadId,
  item,
  canWrite,
  onSaveToMaterials,
  onLocalChange,
}: {
  leadId: number
  item: LeadItem
  canWrite: boolean
  onSaveToMaterials?: () => void
  onLocalChange: (v: { qty: string; rate: string }) => void
}) {
  const update = useUpdateItem(leadId)
  const remove = useDeleteItem(leadId)
  const [qty, setQty] = useState(String(Number(item.qty)))
  const [rate, setRate] = useState(String(Number(item.rate)))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Save 600ms after typing stops (and immediately on blur), only when the values are valid.
  const schedule = (nextQty: string, nextRate: string, now = false) => {
    onLocalChange({ qty: nextQty, rate: nextRate })
    clearTimeout(timer.current)
    const valid = Number(nextQty) > 0 && Number(nextRate) >= 0 && nextRate !== ''
    const changed = Number(nextQty) !== Number(item.qty) || Number(nextRate) !== Number(item.rate)
    if (!valid || !changed) return
    const save = () => update.mutate({ id: item.id, qty: nextQty, rate: nextRate })
    if (now) save()
    else timer.current = setTimeout(save, 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const amount = amountOf(qty, rate)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6.5rem_6rem_2.75rem]">
      <div className="min-w-0 sm:col-start-1 sm:row-start-1">
        <p className="text-sm font-medium text-stone-900">{item.name}</p>
        <p className={clsx('text-xs', item.is_custom ? 'text-amber-700' : 'text-green-700')}>{item.is_custom ? 'Custom item' : 'From Materials'}</p>
        {item.is_custom && onSaveToMaterials && (
          // The ::after layer stretches the tap area to ~44px without making the row taller.
          <button
            onClick={onSaveToMaterials}
            className="relative mt-1 text-left text-xs font-medium text-brand-700 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:underline"
          >
            + Save to Materials
          </button>
        )}
      </div>
      {canWrite ? (
        <button
          onClick={() => remove.mutate(item.id)}
          disabled={remove.isPending}
          aria-label={`Remove ${item.name}`}
          className="grid size-11 place-items-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 sm:col-start-6 sm:row-start-1"
        >
          <X className="size-4" />
        </button>
      ) : (
        <span className="sm:col-start-6" />
      )}
      {/* On phones these sit on a second line; from `sm` they become table cells. */}
      <div className="col-span-2 grid grid-cols-[4.5rem_auto_1fr_auto] items-center gap-2 sm:contents">
        {canWrite ? (
          <input
            aria-label={`Quantity of ${item.name}`}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value)
              schedule(e.target.value, rate)
            }}
            onBlur={() => schedule(qty, rate, true)}
            className={clsx(INPUT, 'sm:col-start-2 sm:row-start-1', Number(qty) <= 0 && 'border-red-400')}
          />
        ) : (
          <span className="text-sm sm:col-start-2">{qty}</span>
        )}
        <span className="text-sm text-stone-600 sm:col-start-3 sm:row-start-1">{item.unit || '—'}</span>
        {canWrite ? (
          <input
            aria-label={`Rate of ${item.name}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value)
              schedule(qty, e.target.value)
            }}
            onBlur={() => schedule(qty, rate, true)}
            className={clsx(INPUT, 'sm:col-start-4 sm:row-start-1', rate === '' && 'border-red-400')}
          />
        ) : (
          <span className="text-sm sm:col-start-4">{formatAmount(rate)}</span>
        )}
        <span className="text-right text-sm font-medium tabular-nums sm:col-start-5 sm:row-start-1">{formatAmount(amount)}</span>
      </div>
      {(update.error || remove.error) && (
        <div className="col-span-full">
          <FormError error={update.error ?? remove.error} />
        </div>
      )}
    </li>
  )
}

/** Name field with catalog suggestions. Picking one fills unit and rate; typing a new name makes a custom item. */
function AddItemForm({ leadId }: { leadId: number }) {
  const listId = useId()
  const { data: materials } = useMaterials({ active: true })
  const { data: choices } = useMaterialChoices()
  const add = useAddItem(leadId)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Material | null>(null)
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('')
  const [rate, setRate] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const suggestions = useMemo(() => {
    const term = name.trim().toLowerCase()
    if (!term || picked) return []
    return (materials ?? []).filter((m) => m.name.toLowerCase().includes(term)).slice(0, 8)
  }, [materials, name, picked])

  const choose = (m: Material) => {
    setPicked(m)
    setName(m.name)
    setUnit(m.default_unit)
    setRate(m.default_rate ? String(Number(m.default_rate)) : '')
    setOpen(false)
    document.getElementById(`${listId}-qty`)?.focus() // next thing to fill in is the quantity
  }

  const reset = () => {
    setName('')
    setPicked(null)
    setQty('1')
    setUnit('')
    setRate('')
  }

  // A picked material brings its unit; a custom item needs one chosen from the list.
  const canAdd = name.trim() !== '' && Number(qty) > 0 && rate !== '' && Number(rate) >= 0 && (picked !== null || unit !== '')
  const hasCatalog = (materials?.length ?? 0) > 0

  return (
    <form
      className="space-y-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canAdd) return
        add.mutate({ catalog_item: picked?.id ?? null, name: name.trim(), unit: unit.trim(), qty, rate }, { onSuccess: reset })
      }}
    >
      <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem]">
        <div className="relative col-span-2 sm:col-span-1">
          <label htmlFor={`${listId}-name`} className="mb-1 block text-xs font-medium text-stone-600">
            Item
          </label>
          <input
            id={`${listId}-name`}
            value={name}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={`${listId}-list`}
            aria-activedescendant={open && suggestions[active] ? `${listId}-opt-${suggestions[active].id}` : undefined}
            placeholder={hasCatalog ? 'Start typing to search Materials' : 'e.g. Plates'}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setName(e.target.value)
              setPicked(null) // editing the name turns it into a custom item
              setActive(0)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (!open || !suggestions.length) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => (a + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => (a - 1 + suggestions.length) % suggestions.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(suggestions[active])
              } else if (e.key === 'Escape') {
                e.stopPropagation() // close the list, not the drawer
                setOpen(false)
              }
            }}
            className={INPUT}
          />
        </div>
        {/* In the normal flow (not floating), so the list scrolls with the drawer and is never cut off.
            Right under the name on phones; full width below the row from `sm`. */}
        {open && suggestions.length > 0 && (
          <ul id={`${listId}-list`} role="listbox" className="col-span-2 -mt-1 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white shadow-sm sm:order-last sm:col-span-4">
            {suggestions.map((m, i) => (
              <li
                key={m.id}
                id={`${listId}-opt-${m.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(m)
                }}
                className={clsx('flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-sm', i === active && 'bg-brand-50')}
              >
                <span className="font-medium text-stone-900">{m.name}</span>
                <span className="text-xs text-stone-500">
                  {[m.category_label, m.default_unit, m.default_rate ? `${formatAmount(m.default_rate)}${m.default_unit ? `/${m.default_unit}` : ''}` : 'rate not set']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Labeled label="Qty" id={`${listId}-qty`}>
          <input id={`${listId}-qty`} type="number" inputMode="decimal" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className={INPUT} />
        </Labeled>
        <Labeled label="Unit" id={`${listId}-unit`}>
          {/* Locked when the item comes from Materials — the material decides its unit. */}
          <select
            id={`${listId}-unit`}
            value={unit}
            disabled={picked !== null}
            title={picked ? 'Set by Materials' : undefined}
            onChange={(e) => setUnit(e.target.value)}
            className={clsx(INPUT, 'disabled:bg-stone-100 disabled:text-stone-700')}
          >
            {unitOptions(choices?.units ?? [], unit, picked ? '—' : 'Pick unit').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Rate (₹)" id={`${listId}-rate`} className="col-span-2 sm:col-span-1">
          <input id={`${listId}-rate`} type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={INPUT} />
        </Labeled>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11" disabled={!canAdd} loading={add.isPending}>
          <Plus className="size-4" /> Add
        </Button>
        {picked && <span className="text-xs text-stone-500">From Materials — unit is fixed; you can change the rate for this lead.</span>}
        {name.trim() && !picked && !(open && suggestions.length > 0) && (
          <span className="text-xs text-amber-700">
            “{name.trim()}” isn't in Materials — pick a unit and rate to add it as a custom item.
          </span>
        )}
        {!hasCatalog && materials && <span className="text-xs text-stone-500">The materials list is empty — add items under Tasks & vendors › Materials.</span>}
      </div>
      <FormError error={add.error} />
    </form>
  )
}

function Labeled({ label, id, className, children }: { label: string; id: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-stone-600">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Adds a custom item to Materials, or links it when a material with that name already exists. */
function SaveToMaterialsForm({ leadId, item, onDone }: { leadId: number; item: LeadItem; onDone: () => void }) {
  const { data: choices } = useMaterialChoices()
  const { data: materials } = useMaterials()
  const save = useSaveToMaterials(leadId)
  const units = choices?.units ?? []
  const [category, setCategory] = useState<Category>('other')
  const [unit, setUnit] = useState(units.includes(item.unit) ? item.unit : '')
  const [rate, setRate] = useState(String(Number(item.rate)))
  const existing = materials?.find((m) => m.name.toLowerCase() === item.name.trim().toLowerCase())

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ id: item.id, category, unit, default_rate: rate === '' ? null : rate }, { onSuccess: onDone })
      }}
    >
      {existing ? (
        <p className="text-sm text-stone-700">
          “{existing.name}” is already in Materials. This item will be linked to it, so it shows as “From Materials”. Its quantity and rate on this lead stay
          the same.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-700">Add “{item.name}” to Materials so it shows up as a suggestion on every lead.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as Category)} options={choices?.categories ?? []} />
            <SelectField label="Unit" required value={unit} onChange={(e) => setUnit(e.target.value)} options={unitOptions(units, unit)} />
          </div>
          <TextField
            label={`Default rate${unit ? ` per ${unit}` : ''} (₹)`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            hint="Optional. Filled in when this material is picked on a lead."
          />
        </>
      )}
      <FormError error={save.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" className="h-11" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" className="h-11" loading={save.isPending} disabled={!existing && !unit}>
          {existing ? 'Link to Materials' : 'Save to Materials'}
        </Button>
      </div>
    </form>
  )
}
