import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { formatINR } from '@/shared/format'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { linesToList, listToLines, useCmsDelete, useCmsList, useCmsSave } from './cms'
import { EVENT_TYPE_OPTIONS, type CmsPackage } from './types'
import { DeleteButton, FormActions, FormError, Published, QueryState, TABLE, TABLE_WRAP, TabHeader, THEAD } from '../kit'

export default function PackagesTab() {
  const { data, isLoading, error } = useCmsList<CmsPackage>('packages')
  const [editing, setEditing] = useState<CmsPackage | 'new' | null>(null)

  return (
    <div>
      <TabHeader title="Packages" intro="Priced starting points shown on the Packages page and home page." onAdd={() => setEditing('new')} addLabel="Add package" />
      <QueryState isLoading={isLoading} error={error} />
      {data && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Event type</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEditing(p)}>
                  <td className="px-4 py-3 font-medium">
                    {p.name} {p.is_popular && <span className="ml-1 text-xs text-gold-600">★ Most popular</span>}
                  </td>
                  <td className="px-4 py-3">{p.event_type_label || '—'}</td>
                  <td className="px-4 py-3">{formatINR(p.price)}</td>
                  <td className="px-4 py-3">
                    <Published on={p.is_published} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal wide open={editing !== null} title={editing === 'new' ? 'Add package' : 'Edit package'} onClose={() => setEditing(null)}>
        {editing !== null && <PackageForm pkg={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

type Values = Omit<CmsPackage, 'id' | 'slug' | 'event_type_label' | 'inclusions'> & { inclusions: string }

function PackageForm({ pkg, onDone }: { pkg: CmsPackage | null; onDone: () => void }) {
  const save = useCmsSave<CmsPackage>('packages')
  const remove = useCmsDelete('packages')
  const { register, handleSubmit } = useForm<Values>({
    defaultValues: pkg
      ? { ...pkg, inclusions: listToLines(pkg.inclusions) }
      : { name: '', tagline: '', event_type: '', price: '', price_note: 'starting from', inclusions: '', is_popular: false, is_published: true, order: 0 },
  })

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate({ id: pkg?.id, data: { ...v, inclusions: linesToList(v.inclusions) } }, { onSuccess: onDone }))}
      className="grid gap-4 sm:grid-cols-2"
    >
      <TextField label="Name" required {...register('name')} />
      <SelectField label="Event type" options={[{ value: '', label: 'Any' }, ...EVENT_TYPE_OPTIONS]} {...register('event_type')} />
      <TextField label="Tagline" className="sm:col-span-2" {...register('tagline')} />
      <TextField label="Price (₹)" type="number" min={0} required {...register('price')} />
      <TextField label="Price note" hint='e.g. "starting from"' {...register('price_note')} />
      <TextAreaField label="Inclusions" rows={6} hint="One item per line." className="sm:col-span-2" {...register('inclusions')} />
      <TextField label="Display order" type="number" min={0} {...register('order')} />
      <div className="space-y-3 pt-6">
        <CheckboxField label="Published" {...register('is_published')} />
        <CheckboxField label='Highlight as "Most popular"' {...register('is_popular')} />
      </div>
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error ?? remove.error} />
        <FormActions
          onCancel={onDone}
          pending={save.isPending}
          extra={pkg && <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(pkg.id, { onSuccess: onDone })} />}
        />
      </div>
    </form>
  )
}
