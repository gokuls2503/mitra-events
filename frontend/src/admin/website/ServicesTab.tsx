import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { formatINR } from '@/shared/format'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { linesToList, listToLines, numOrNull, useCmsDelete, useCmsList, useCmsSave, type ImageChange } from './cms'
import { ImageInput } from './ImageInput'
import { EVENT_TYPE_OPTIONS, type CmsService } from './types'
import { DeleteButton, FormActions, FormError, Published, QueryState, TABLE, TABLE_WRAP, TabHeader, THEAD } from '../kit'

export default function ServicesTab() {
  const { data, isLoading, error } = useCmsList<CmsService>('services')
  const [editing, setEditing] = useState<CmsService | 'new' | null>(null)

  return (
    <div>
      <TabHeader title="Services" intro="Each service gets its own page on the website." onAdd={() => setEditing('new')} addLabel="Add service" />
      <QueryState isLoading={isLoading} error={error} />
      {data && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEditing(s)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {s.cover_image ? (
                        <img src={s.cover_image} alt="" className="size-10 rounded object-cover" />
                      ) : (
                        <span className="size-10 rounded bg-stone-100" />
                      )}
                      <span>
                        <span className="block font-medium">{s.name}</span>
                        {s.is_featured && <span className="text-xs text-gold-600">★ On home page</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{s.category_label}</td>
                  <td className="px-4 py-3">{formatINR(s.starting_price) || '—'}</td>
                  <td className="px-4 py-3">
                    <Published on={s.is_published} />
                  </td>
                  <td className="px-4 py-3 text-stone-500">{s.order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal wide open={editing !== null} title={editing === 'new' ? 'Add service' : 'Edit service'} onClose={() => setEditing(null)}>
        {editing !== null && <ServiceForm service={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

type Values = Omit<CmsService, 'id' | 'slug' | 'category_label' | 'cover_image' | 'highlights'> & { highlights: string }

function ServiceForm({ service, onDone }: { service: CmsService | null; onDone: () => void }) {
  const save = useCmsSave<CmsService>('services')
  const remove = useCmsDelete('services')
  const [image, setImage] = useState<ImageChange>()
  const { register, handleSubmit } = useForm<Values>({
    defaultValues: service
      ? { ...service, highlights: listToLines(service.highlights) }
      : { name: '', category: 'WEDDING', short_description: '', description: '', highlights: '', starting_price: '', is_featured: false, is_published: true, order: 0, seo_title: '', seo_description: '' },
  })

  const onSubmit = (v: Values) =>
    save.mutate(
      { id: service?.id, data: { ...v, highlights: linesToList(v.highlights), starting_price: numOrNull(v.starting_price) }, images: { cover_image: image } },
      { onSuccess: onDone },
    )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <TextField label="Name" required {...register('name')} />
      <SelectField label="Category" options={EVENT_TYPE_OPTIONS} {...register('category')} />
      <TextField label="Short description" required maxLength={200} className="sm:col-span-2" hint="Shown on cards (max 200 characters)." {...register('short_description')} />
      <TextAreaField label="Full description" rows={5} className="sm:col-span-2" hint="Blank line between paragraphs." {...register('description')} />
      <TextAreaField label="What's included" rows={4} hint="One item per line." {...register('highlights')} />
      <div className="space-y-4">
        <TextField label="Starting price (₹)" type="number" min={0} {...register('starting_price')} />
        <TextField label="Display order" type="number" min={0} hint="Lower numbers show first." {...register('order')} />
      </div>
      <ImageInput label="Cover image" currentUrl={service?.cover_image} value={image} onChange={setImage} />
      <div className="space-y-3 pt-6">
        <CheckboxField label="Published" hint="Visible on the website" {...register('is_published')} />
        <CheckboxField label="Feature on home page" {...register('is_featured')} />
      </div>
      <details className="sm:col-span-2">
        <summary className="cursor-pointer text-sm font-medium text-stone-700">Search engine (SEO) — optional</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextField label="SEO title" maxLength={70} hint="Defaults to the name." {...register('seo_title')} />
          <TextField label="SEO description" maxLength={160} hint="Defaults to the short description." {...register('seo_description')} />
        </div>
      </details>
      <div className="sm:col-span-2 space-y-3">
        <FormError error={save.error ?? remove.error} />
        <FormActions
          onCancel={onDone}
          pending={save.isPending}
          extra={service && <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(service.id, { onSuccess: onDone })} />}
        />
      </div>
    </form>
  )
}
