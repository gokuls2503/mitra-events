import { useState } from 'react'
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form'

import { EVENT_TYPE_LABELS } from '@/public/api'
import { formatINR } from '@/shared/format'
import { CheckboxField, SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { useCmsDelete, useCmsList, useCmsSave } from './cms'
import { EVENT_TYPE_OPTIONS, type CmsEstimatorAddon, type CmsEstimatorEventType } from './types'
import { DeleteButton, FormActions, FormError, Published, QueryState, TABLE, TABLE_WRAP, TabHeader, THEAD } from '../kit'

export default function EstimatorTab() {
  return (
    <div className="space-y-10">
      <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
        <strong>How the estimate is calculated:</strong> base price + stage area (width × depth in sq ft) × rate per sq ft + add-ons. Visitors see a range from 10% below
        to 15% above that total, excluding GST.
      </div>
      <EventTypes />
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
                <th className="px-4 py-3">Per sq ft</th>
                <th className="px-4 py-3">Stage area</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.data.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEditing(e)}>
                  <td className="px-4 py-3 font-medium">{e.label}</td>
                  <td className="px-4 py-3">{formatINR(e.base_price)}</td>
                  <td className="px-4 py-3">{formatINR(e.rate_per_sqft)}</td>
                  <td className="px-4 py-3">
                    {e.min_sqft}–{e.max_sqft} sq ft
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
            defaults={{ event_type: 'WEDDING', description: '', base_price: '0', rate_per_sqft: '25', min_sqft: 50, max_sqft: 2000, is_active: true, order: 0 }}
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
                <TextField label="Rate per sq ft (₹)" type="number" min={0} required {...register('rate_per_sqft')} />
                <TextField label="Base price (₹)" type="number" min={0} hint="Added to every estimate. Use 0 for none." {...register('base_price')} />
                <TextField label="Smallest stage (sq ft)" type="number" min={1} {...register('min_sqft')} />
                <TextField label="Largest stage (sq ft)" type="number" min={1} {...register('max_sqft')} />
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
