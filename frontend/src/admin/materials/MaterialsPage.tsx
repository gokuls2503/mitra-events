import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'

import { api } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'

import { unitOptions, useMaterialChoices, useMaterials, type Category, type Material } from '../crm/references/api'
import { EmptyState, FormError, QueryState } from '../kit'

const TAG: Record<Category, string> = {
  flowers: 'bg-pink-100 text-pink-800',
  decor: 'bg-amber-100 text-amber-800',
  lighting: 'bg-sky-100 text-sky-800',
  fabric: 'bg-violet-100 text-violet-800',
  furniture: 'bg-lime-100 text-lime-800',
  other: 'bg-stone-100 text-stone-700',
}

const INACTIVE_NOTE = 'Inactive materials are hidden from the lead Items list but stay on leads that already use them.'

function useUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Material> & { id: number }) => (await api.patch<Material>(`/crm/materials/${id}/`, data)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['crm', 'materials'] }),
  })
}

/** Master list of decoration materials. Picked from when adding Items to a lead. */
export default function MaterialsPage() {
  const { hasRole } = useAuth()
  const canWrite = hasRole('OWNER', 'MANAGER')
  const { data, isLoading, error } = useMaterials()
  const { data: choices } = useMaterialChoices()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [editing, setEditing] = useState<Material | 'new' | null>(null)

  const term = search.trim().toLowerCase()
  const rows = (data ?? []).filter((m) => (category === 'all' || m.category === category) && (!term || m.name.toLowerCase().includes(term)))
  const activeCount = (data ?? []).filter((m) => m.is_active).length

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-brand-800">Materials</h1>
          <p className="mt-1 text-sm text-stone-600">Predefined items, units and rates. These appear in the Items list on every lead.</p>
        </div>
        {canWrite && editing === null && (
          <Button className="h-11" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add material
          </Button>
        )}
      </div>

      {editing !== null && (
        <MaterialForm key={editing === 'new' ? 'new' : editing.id} material={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-48 flex-1 sm:max-w-xs">
            <span className="sr-only">Search materials</span>
            <Search className="absolute top-3.5 left-3 size-4 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials"
              className="h-11 w-full rounded-lg border border-stone-300 bg-white pr-3 pl-9 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </label>
          <div role="tablist" aria-label="Category" className="flex flex-wrap gap-1 sm:ml-auto">
            {[{ value: 'all' as const, label: 'All' }, ...(choices?.categories ?? [])].map((c) => (
              <button
                key={c.value}
                role="tab"
                aria-selected={category === c.value}
                onClick={() => setCategory(c.value)}
                className={clsx(
                  'h-11 rounded-full px-4 text-sm',
                  category === c.value ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <QueryState isLoading={isLoading} error={error} />
        {data && data.length === 0 && (
          <EmptyState>No materials yet. {canWrite ? 'Add the items your team commonly uses — flowers, drapes, lights, frames…' : 'The owner or a manager can add them.'}</EmptyState>
        )}
        {data && data.length > 0 && rows.length === 0 && <EmptyState>No materials match this search.</EmptyState>}

        {rows.length > 0 && (
          <>
            {/* Table from md up; stacked cards on phones. */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="text-xs text-stone-500">
                <tr className="border-b border-stone-200">
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Default rate (₹)</th>
                  <th className="py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((m) => (
                  <tr key={m.id} className={clsx(!m.is_active && 'text-stone-500')}>
                    <td className="py-2 pr-3">
                      <MaterialName material={m} canWrite={canWrite} onEdit={() => setEditing(m)} />
                    </td>
                    <td className="px-3 py-2">
                      <CategoryTag material={m} />
                    </td>
                    <td className="px-3 py-2">{m.default_unit || '—'}</td>
                    <td className="px-3 py-2">
                      <RateInput material={m} canWrite={canWrite} />
                    </td>
                    <td className="py-2 pl-3">
                      <StatusToggle material={m} canWrite={canWrite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-stone-100 md:hidden">
              {rows.map((m) => (
                <li key={m.id} className={clsx('space-y-2 py-3', !m.is_active && 'text-stone-500')}>
                  <div className="flex items-start justify-between gap-2">
                    <MaterialName material={m} canWrite={canWrite} onEdit={() => setEditing(m)} />
                    <CategoryTag material={m} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <RateInput material={m} canWrite={canWrite} />
                    <StatusToggle material={m} canWrite={canWrite} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {data && data.length > 0 && (
          <p className="mt-4 text-xs text-stone-500">
            {activeCount} of {data.length} active. {INACTIVE_NOTE}
          </p>
        )}
      </section>
    </div>
  )
}

function MaterialName({ material, canWrite, onEdit }: { material: Material; canWrite: boolean; onEdit: () => void }) {
  if (!canWrite) return <span className="font-medium">{material.name}</span>
  return (
    <button onClick={onEdit} className="min-h-11 text-left font-medium hover:text-brand-800 hover:underline" aria-label={`Edit ${material.name}`}>
      {material.name}
    </button>
  )
}

function CategoryTag({ material }: { material: Material }) {
  return <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', TAG[material.category])}>{material.category_label}</span>
}

/** Default rate, edited in place. Saves on Enter or when leaving the box; empty means "not set". */
function RateInput({ material, canWrite }: { material: Material; canWrite: boolean }) {
  const saved = material.default_rate === null ? '' : String(Number(material.default_rate))
  const [value, setValue] = useState(saved)
  const update = useUpdateMaterial()
  const unit = material.default_unit ? `/${material.default_unit}` : ''

  if (!canWrite) {
    return <span className="tabular-nums">{saved ? `₹${saved}${unit}` : 'Not set'}</span>
  }
  const save = () => {
    if (value === saved || Number(value) < 0) return
    update.mutate({ id: material.id, default_rate: value === '' ? null : value })
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        placeholder="Not set"
        aria-label={`Default rate of ${material.name}${material.default_unit ? ` per ${material.default_unit}` : ''}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setValue(saved)
        }}
        className={clsx(
          'h-11 w-28 rounded-lg border bg-white px-2.5 text-sm tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none',
          update.isError || Number(value) < 0 ? 'border-red-400' : 'border-stone-300',
        )}
      />
      <span className="text-xs text-stone-500">{unit}</span>
      {update.isError && <span className="sr-only">Couldn't save the rate.</span>}
    </div>
  )
}

function StatusToggle({ material, canWrite }: { material: Material; canWrite: boolean }) {
  const update = useUpdateMaterial()
  const cls = clsx(
    'inline-flex h-11 min-w-24 items-center justify-center rounded-full px-4 text-xs font-medium ring-1',
    material.is_active ? 'bg-green-50 text-green-800 ring-green-300' : 'bg-stone-100 text-stone-600 ring-stone-200',
  )
  if (!canWrite) return <span className={cls}>{material.is_active ? 'Active' : 'Inactive'}</span>
  return (
    <button
      role="switch"
      aria-checked={material.is_active}
      aria-label={`${material.name} is ${material.is_active ? 'active' : 'inactive'}`}
      disabled={update.isPending}
      onClick={() => update.mutate({ id: material.id, is_active: !material.is_active })}
      className={clsx(cls, 'hover:opacity-80 disabled:opacity-60')}
    >
      {material.is_active ? 'Active' : 'Inactive'}
    </button>
  )
}

function MaterialForm({ material, onDone }: { material?: Material; onDone: () => void }) {
  const qc = useQueryClient()
  const { data: choices } = useMaterialChoices()
  const [name, setName] = useState(material?.name ?? '')
  const [category, setCategory] = useState<Category>(material?.category ?? 'flowers')
  const [unit, setUnit] = useState(material?.default_unit ?? '')
  const [rate, setRate] = useState(material?.default_rate ? String(Number(material.default_rate)) : '')

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, category, default_unit: unit, default_rate: rate === '' ? null : rate }
      return material ? api.patch(`/crm/materials/${material.id}/`, body) : api.post('/crm/materials/', body)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'materials'] })
      onDone()
    },
  })

  return (
    <form
      className="mb-6 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-stone-700 uppercase">{material ? 'Edit material' : 'New material'}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <TextField label="Material name" required autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jasmine garland" />
        <SelectField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          options={choices?.categories ?? [{ value: category, label: material?.category_label ?? 'Flowers' }]}
        />
        <SelectField label="Unit" required value={unit} onChange={(e) => setUnit(e.target.value)} options={unitOptions(choices?.units ?? [], unit)} />
        <TextField
          label={`Default rate${unit ? ` per ${unit}` : ''} (₹)`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="Optional"
        />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" className="h-11" loading={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="secondary" className="h-11" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
      {material && <p className="mt-3 text-xs text-stone-500">Changes apply to items added from now on. Leads that already use this material keep their name, unit and rate.</p>}
      <div className="mt-2">
        <FormError error={save.error} />
      </div>
    </form>
  )
}
