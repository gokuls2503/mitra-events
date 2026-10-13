import { Star } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { CheckboxField, SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { useCmsDelete, useCmsList, useCmsSave, type ImageChange } from './cms'
import { ImageInput } from './ImageInput'
import { EVENT_TYPE_OPTIONS, type CmsTestimonial } from './types'
import { DeleteButton, FormActions, FormError, Published, QueryState, TabHeader } from '../kit'

export default function TestimonialsTab() {
  const { data, isLoading, error } = useCmsList<CmsTestimonial>('testimonials')
  const [editing, setEditing] = useState<CmsTestimonial | 'new' | null>(null)

  return (
    <div>
      <TabHeader
        title="Testimonials"
        intro="Only publish genuine reviews, with the client's permission."
        onAdd={() => setEditing('new')}
        addLabel="Add testimonial"
      />
      <QueryState isLoading={isLoading} error={error} />
      <ul className="grid gap-3 md:grid-cols-2">
        {data?.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => setEditing(t)}
              className="block w-full rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-brand-300"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.client_name}</span>
                <span className="text-xs text-stone-500">{t.event_type_label}</span>
                <span className="ml-auto flex items-center gap-2">
                  {t.is_featured && <Star className="size-4 fill-gold-400 text-gold-400" aria-label="On home page" />}
                  <Published on={t.is_published} />
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-stone-600">{t.quote}</p>
            </button>
          </li>
        ))}
      </ul>
      <Modal wide open={editing !== null} title={editing === 'new' ? 'Add testimonial' : 'Edit testimonial'} onClose={() => setEditing(null)}>
        {editing !== null && <TestimonialForm t={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

type Values = Omit<CmsTestimonial, 'id' | 'event_type_label' | 'photo'>

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: '★'.repeat(n) }))

function TestimonialForm({ t, onDone }: { t: CmsTestimonial | null; onDone: () => void }) {
  const save = useCmsSave<CmsTestimonial>('testimonials')
  const remove = useCmsDelete('testimonials')
  const [photo, setPhoto] = useState<ImageChange>()
  const { register, handleSubmit } = useForm<Values>({
    defaultValues: t ?? { client_name: '', event_type: '', event_location: '', quote: '', rating: 5, is_featured: false, is_published: true, order: 0 },
  })

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate({ id: t?.id, data: v, images: { photo } }, { onSuccess: onDone }))}
      className="grid gap-4 sm:grid-cols-2"
    >
      <TextField label="Client name" required {...register('client_name')} />
      <SelectField label="Event type" options={[{ value: '', label: '—' }, ...EVENT_TYPE_OPTIONS]} {...register('event_type')} />
      <TextField label="Location" hint="e.g. RS Puram" {...register('event_location')} />
      <SelectField label="Rating" options={RATING_OPTIONS} {...register('rating')} />
      <TextAreaField label="Review" rows={5} required className="sm:col-span-2" {...register('quote')} />
      <ImageInput label="Client photo (optional)" currentUrl={t?.photo} value={photo} onChange={setPhoto} />
      <div className="space-y-3">
        <TextField label="Display order" type="number" min={0} {...register('order')} />
        <CheckboxField label="Published" {...register('is_published')} />
        <CheckboxField label="Show on home page" {...register('is_featured')} />
      </div>
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error ?? remove.error} />
        <FormActions
          onCancel={onDone}
          pending={save.isPending}
          extra={t && <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(t.id, { onSuccess: onDone })} />}
        />
      </div>
    </form>
  )
}
