import { useState } from 'react'
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form'

import { EVENT_TYPE_LABELS } from '@/public/api'
import { formatINR } from '@/shared/format'
import { CheckboxField, SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { useCmsDelete, useCmsList, useCmsSave } from './cms'
import { EVENT_TYPE_OPTIONS, type CmsEstimatorAddon, type CmsEstimatorEventType, type CmsEstimatorTier } from './types'
import { DeleteButton, FormActions, FormError, Published, QueryState, TABLE, TABLE_WRAP, TabHeader, THEAD } from '../kit'

export default function EstimatorTab() {
  return (
    <div className="space-y-10">
      <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
        <strong>How the estimate is calculated:</strong> (base price + per-guest rate × guests) × decor multiplier + add-ons.
        Visitors see a range from 10% below to 15% above that total, excluding GST.
      </div>
      <EventTypes />
      <Tiers />
      <Addons />
    </div>
  )
}

// --- Event types -----------------------------------------------------------

function EventTypes() {
  const list = useCmsList<CmsEstimatorEventType>('estimator/event-types')
  const [editing, setEditing] = useState<CmsEstimatorEventType | 'new' | null>(null)
  return (
    <section>
      <TabHeader title="Event types" intro="Which events the estimator offers, with their pricing." onAdd={() => setEditing('new')} addLabel="Add event type" />
      <QueryState isLoading={list.isLoading} error={list.error} />
      {list.data && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Base price</th>
                <th className="px-4 py-3">Per guest</th>
                <th className="px-4 py-3">Guests</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.data.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEditing(e)}>
                  <td className="px-4 py-3 font-medium">{e.label}</td>
                  <td className="px-4 py-3">{formatINR(e.base_price)}</td>
                  <td className="px-4 py-3">{formatINR(e.per_guest_rate)}</td>
                  <td className="px-4 py-3">
                    {e.min_guests}–{e.max_guests}
                  </td>
                  <td className="px-4 py-3">
                    <Published on={e.is_active} labels={['Active', 'Off']} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'Add event type' : 'Edit event type'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <SimpleForm<CmsEstimatorEventType>
            resource="estimator/event-types"
            item={editing === 'new' ? null : editing}
            defaults={{ event_type: 'WEDDING', description: '', base_price: '', per_guest_rate: '0', min_guests: 50, max_guests: 1500, is_active: true, order: 0 }}
            onDone={() => setEditing(null)}
            render={(register, isNew) => (
              <>
                <SelectField
                  label="Event type"
                  options={EVENT_TYPE_OPTIONS}
                  disabled={!isNew}
                  hint={isNew ? undefined : `${EVENT_TYPE_LABELS[(editing as CmsEstimatorEventType).event_type]} — create a new row to change`}
                  {...register('event_type')}
                />
                <TextField label="Short description" {...register('description')} />
                <TextField label="Base price (₹)" type="number" min={0} required {...register('base_price')} />
                <TextField label="Rate per guest (₹)" type="number" min={0} {...register('per_guest_rate')} />
                <TextField label="Minimum guests" type="number" min={1} {...register('min_guests')} />
                <TextField label="Maximum guests" type="number" min={1} {...register('max_guests')} />
                <TextField label="Display order" type="number" min={0} {...register('order')} />
                <CheckboxField label="Active (shown in estimator)" className="pt-7" {...register('is_active')} />
              </>
            )}
          />
        )}
      </Modal>
    </section>
  )
}

// --- Decor tiers -----------------------------------------------------------

function Tiers() {
  const list = useCmsList<CmsEstimatorTier>('estimator/tiers')
  const [editing, setEditing] = useState<CmsEstimatorTier | 'new' | null>(null)
  return (
    <section>
      <TabHeader title="Decor levels" intro="Multipliers applied to the base cost, e.g. Premium ×1.4." onAdd={() => setEditing('new')} addLabel="Add level" />
      <QueryState isLoading={list.isLoading} error={list.error} />
      <ul className="grid gap-3 sm:grid-cols-3">
        {list.data?.map((t) => (
          <li key={t.id}>
            <button onClick={() => setEditing(t)} className="w-full rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-brand-300">
              <span className="flex items-center justify-between">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-brand-700">×{Number(t.multiplier).toFixed(2)}</span>
              </span>
              <span className="mt-1 block text-xs text-stone-500">{t.description}</span>
              {!t.is_active && <span className="mt-2 inline-block"><Published on={false} labels={['', 'Off']} /></span>}
            </button>
          </li>
        ))}
      </ul>
      <Modal open={editing !== null} title={editing === 'new' ? 'Add decor level' : 'Edit decor level'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <SimpleForm<CmsEstimatorTier>
            resource="estimator/tiers"
            item={editing === 'new' ? null : editing}
            defaults={{ name: '', description: '', multiplier: '1.00', is_active: true, order: 0 }}
            onDone={() => setEditing(null)}
            render={(register) => (
              <>
                <TextField label="Name" required {...register('name')} />
                <TextField label="Multiplier" type="number" step="0.05" min="0.1" required hint="1.00 = base price" {...register('multiplier')} />
                <TextField label="Description" className="sm:col-span-2" {...register('description')} />
                <TextField label="Display order" type="number" min={0} {...register('order')} />
                <CheckboxField label="Active" className="pt-7" {...register('is_active')} />
              </>
            )}
          />
        )}
      </Modal>
    </section>
  )
}

// --- Add-ons ----------------------------------------------------------------

function Addons() {
  const list = useCmsList<CmsEstimatorAddon>('estimator/addons')
  const [editing, setEditing] = useState<CmsEstimatorAddon | 'new' | null>(null)
  return (
    <section>
      <TabHeader title="Add-ons" intro="Optional extras visitors can tick." onAdd={() => setEditing('new')} addLabel="Add add-on" />
      <QueryState isLoading={list.isLoading} error={list.error} />
      {list.data && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">Add-on</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.data.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEditing(a)}>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">
                    {formatINR(a.price)}
                    {a.pricing === 'PER_GUEST' && ' per guest'}
                  </td>
                  <td className="px-4 py-3">
                    <Published on={a.is_active} labels={['Active', 'Off']} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'Add add-on' : 'Edit add-on'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <SimpleForm<CmsEstimatorAddon>
            resource="estimator/addons"
            item={editing === 'new' ? null : editing}
            defaults={{ name: '', description: '', pricing: 'FLAT', price: '', is_active: true, order: 0 }}
            onDone={() => setEditing(null)}
            render={(register) => (
              <>
                <TextField label="Name" required className="sm:col-span-2" {...register('name')} />
                <SelectField
                  label="Pricing"
                  options={[
                    { value: 'FLAT', label: 'Flat price' },
                    { value: 'PER_GUEST', label: 'Per guest' },
                  ]}
                  {...register('pricing')}
                />
                <TextField label="Price (₹)" type="number" min={0} required {...register('price')} />
                <TextField label="Display order" type="number" min={0} {...register('order')} />
                <CheckboxField label="Active" className="pt-7" {...register('is_active')} />
              </>
            )}
          />
        )}
      </Modal>
    </section>
  )
}

// --- Shared small form -------------------------------------------------------

interface SimpleFormProps<T extends { id: number }> {
  resource: string
  item: T | null
  defaults: DefaultValues<Omit<T, 'id'>>
  onDone: () => void
  render: (register: ReturnType<typeof useForm<FieldValues>>['register'], isNew: boolean) => React.ReactNode
}

function SimpleForm<T extends { id: number }>({ resource, item, defaults, onDone, render }: SimpleFormProps<T>) {
  const save = useCmsSave<T>(resource)
  const remove = useCmsDelete(resource)
  const { register, handleSubmit } = useForm<FieldValues>({ defaultValues: (item ?? defaults) as FieldValues })

  return (
    <form onSubmit={handleSubmit((v) => save.mutate({ id: item?.id, data: v }, { onSuccess: onDone }))} className="grid gap-4 sm:grid-cols-2">
      {render(register, !item)}
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error ?? remove.error} />
        <FormActions
          onCancel={onDone}
          pending={save.isPending}
          extra={item && <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(item.id, { onSuccess: onDone })} />}
        />
      </div>
    </form>
  )
}
