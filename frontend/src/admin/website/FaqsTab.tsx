import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { CheckboxField, TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { useCmsDelete, useCmsList, useCmsSave } from './cms'
import type { CmsFaq } from './types'
import { DeleteButton, FormActions, FormError, Published, QueryState, TabHeader } from '../kit'

export default function FaqsTab() {
  const { data, isLoading, error } = useCmsList<CmsFaq>('faqs')
  const [editing, setEditing] = useState<CmsFaq | 'new' | null>(null)

  return (
    <div>
      <TabHeader
        title="FAQs"
        intro="Questions and answers shown on the About page. Lower display order comes first."
        onAdd={() => setEditing('new')}
        addLabel="Add question"
      />
      <QueryState isLoading={isLoading} error={error} />
      <ul className="space-y-3">
        {data?.map((f) => (
          <li key={f.id}>
            <button
              onClick={() => setEditing(f)}
              className="block w-full rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-brand-300"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{f.question}</span>
                <span className="ml-auto">
                  <Published on={f.is_published} />
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-stone-600">{f.answer}</p>
            </button>
          </li>
        ))}
      </ul>
      <Modal open={editing !== null} title={editing === 'new' ? 'Add question' : 'Edit question'} onClose={() => setEditing(null)}>
        {editing !== null && <FaqForm f={editing === 'new' ? null : editing} nextOrder={data?.length ?? 0} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

type Values = Omit<CmsFaq, 'id'>

function FaqForm({ f, nextOrder, onDone }: { f: CmsFaq | null; nextOrder: number; onDone: () => void }) {
  const save = useCmsSave<CmsFaq>('faqs')
  const remove = useCmsDelete('faqs')
  const { register, handleSubmit } = useForm<Values>({
    defaultValues: f ?? { question: '', answer: '', is_published: true, order: nextOrder },
  })

  return (
    <form onSubmit={handleSubmit((v) => save.mutate({ id: f?.id, data: v }, { onSuccess: onDone }))} className="space-y-4">
      <TextField label="Question" required maxLength={200} {...register('question')} />
      <TextAreaField label="Answer" rows={5} required {...register('answer')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Display order" type="number" min={0} {...register('order')} />
        <CheckboxField label="Published" {...register('is_published')} />
      </div>
      <FormError error={save.error ?? remove.error} />
      <FormActions
        onCancel={onDone}
        pending={save.isPending}
        extra={f && <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(f.id, { onSuccess: onDone })} />}
      />
    </form>
  )
}
