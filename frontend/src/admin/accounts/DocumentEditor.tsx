import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { todayISO } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field'

import { useBookings, type Client } from '../crm/api'
import { FormError } from '../kit'
import { accounts, useAccountsMutation, useSettings, useTaxRates, type Invoice, type Item, type Quotation } from './api'
import { previewLine, previewTotals, rupees } from './calc'
import { ClientPicker, Money } from './ui'

type Kind = 'invoice' | 'quotation'

interface Values {
  date: string
  second_date: string // due date (invoice) or valid until (quotation)
  place_of_supply: string
  booking: string
  notes: string
  terms: string
  items: Item[]
}

export interface Prefill {
  client?: Pick<Client, 'id' | 'name' | 'phone'> | null
  booking?: number | null
  items?: Item[]
}

export function DocumentEditor({ kind, doc, prefill }: { kind: Kind; doc?: Invoice | Quotation; prefill?: Prefill }) {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const { data: taxRates } = useTaxRates()
  const [client, setClient] = useState<Pick<Client, 'id' | 'name' | 'phone'> | null>(
    doc ? { id: doc.client, name: doc.client_name, phone: '' } : prefill?.client ?? null,
  )
  const { data: bookings } = useBookings({ client: client?.id, page_size: 100, ordering: '-event_date' }) // only meaningful with a client
  const save = useAccountsMutation(
    async (body: Record<string, unknown>): Promise<{ id: number }> =>
      kind === 'invoice' ? accounts.saveInvoice(body) : accounts.saveQuotation(body),
  )

  const defaultTax = taxRates?.find((t) => t.id === settings?.default_tax_rate)?.rate ?? '18'
  const blankItem = (): Item => ({
    description: '',
    sac: settings?.default_sac ?? '998596',
    quantity: '1',
    unit: 'Nos',
    rate: '',
    discount: '0',
    tax_rate: String(Number(defaultTax)),
  })

  const docDate = doc ? ('invoice_date' in doc ? doc.invoice_date : doc.date) : todayISO()
  const secondDate = doc ? ('due_date' in doc ? doc.due_date : doc.valid_until) ?? '' : ''
  const { control, register, handleSubmit, setValue } = useForm<Values>({
    defaultValues: {
      date: docDate,
      second_date: secondDate,
      place_of_supply: doc?.place_of_supply ?? settings?.state_code ?? '33',
      booking: String(doc?.booking ?? prefill?.booking ?? ''),
      notes: doc?.notes ?? '',
      terms: doc?.terms ?? '',
      items: doc?.items.map((i) => ({ ...i, tax_rate: String(Number(i.tax_rate)) })) ?? prefill?.items ?? [blankItem()],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = useWatch({ control, name: 'items' })
  const place = useWatch({ control, name: 'place_of_supply' })
  // Controlled: the event list loads after the form, and an uncontrolled <select> would show
  // the first option instead of the pre-filled event.
  const bookingValue = useWatch({ control, name: 'booking' })
  const intra = place === (settings?.state_code ?? '33')
  const totals = previewTotals(items, intra)

  const submit = (v: Values) => {
    const body: Record<string, unknown> = {
      id: doc?.id,
      client: client?.id,
      booking: v.booking ? Number(v.booking) : null,
      place_of_supply: v.place_of_supply,
      notes: v.notes,
      items: v.items.map((i) => ({ ...i, discount: i.discount || '0' })),
    }
    if (v.terms) body.terms = v.terms
    if (kind === 'invoice') {
      body.invoice_date = v.date
      if (v.second_date) body.due_date = v.second_date
    } else {
      body.date = v.date
      if (v.second_date) body.valid_until = v.second_date
    }
    save.mutate(body, { onSuccess: (saved) => navigate(`/admin/accounts/${kind}s/${saved.id}`) })
  }

  const taxOptions = (taxRates ?? []).filter((t) => t.is_active).map((t) => ({ value: String(Number(t.rate)), label: `${Number(t.rate)}%` }))
  const stateOptions = (settings?.states ?? []).map((s) => ({ value: s.code, label: `${s.code} - ${s.name}` }))

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <ClientPicker value={client} onChange={setClient} disabled={!!doc} />
        </div>
        <SelectField
          label="Event (optional)"
          disabled={!client}
          options={[
            { value: '', label: client ? 'Not linked to an event' : 'Choose a client first' },
            ...(client ? bookings?.results ?? [] : []).map((b) => ({ value: String(b.id), label: `${b.number} · ${b.title}` })),
          ]}
          value={bookingValue}
          onChange={(e) => setValue('booking', e.target.value, { shouldDirty: true })}
        />
        <SelectField label="Place of supply" options={stateOptions.length ? stateOptions : [{ value: '33', label: '33 - Tamil Nadu' }]} hint={intra ? 'Same state: CGST + SGST' : 'Other state: IGST'} {...register('place_of_supply')} />
        <TextField label={kind === 'invoice' ? 'Invoice date' : 'Quotation date'} type="date" required {...register('date')} />
        <TextField
          label={kind === 'invoice' ? 'Due date' : 'Valid until'}
          type="date"
          hint={doc ? undefined : `Leave blank for ${kind === 'invoice' ? settings?.invoice_due_days ?? 7 : settings?.quotation_valid_days ?? 15} days`}
          {...register('second_date')}
        />
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="w-[34%] pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">SAC</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Unit</th>
                <th className="pb-2 font-medium">Rate (₹)</th>
                <th className="pb-2 font-medium">Discount (₹)</th>
                <th className="pb-2 font-medium">GST</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, idx) => {
                const line = items[idx] ? previewLine(items[idx], intra) : null
                const cell = 'w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none'
                return (
                  <tr key={f.id} className="align-top">
                    <td className="py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} description`} required className={cell} placeholder="e.g. Reception stage decor" {...register(`items.${idx}.description`)} />
                    </td>
                    <td className="w-24 py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} SAC`} className={cell} {...register(`items.${idx}.sac`)} />
                    </td>
                    <td className="w-20 py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} quantity`} type="number" step="0.01" min="0.01" required className={cell} {...register(`items.${idx}.quantity`)} />
                    </td>
                    <td className="w-20 py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} unit`} className={cell} {...register(`items.${idx}.unit`)} />
                    </td>
                    <td className="w-32 py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} rate`} type="number" step="0.01" min="0" required className={cell} {...register(`items.${idx}.rate`)} />
                    </td>
                    <td className="w-28 py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} discount`} type="number" step="0.01" min="0" className={cell} {...register(`items.${idx}.discount`)} />
                    </td>
                    <td className="w-20 py-1 pr-2">
                      <select aria-label={`Line ${idx + 1} GST rate`} className={cell} {...register(`items.${idx}.tax_rate`)}>
                        {(taxOptions.length ? taxOptions : [{ value: '18', label: '18%' }]).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-32 py-2 text-right tabular-nums">{line ? <Money value={rupees(line.amount)} /> : '—'}</td>
                    <td className="w-8 py-1 pl-1">
                      <button type="button" onClick={() => remove(idx)} disabled={fields.length === 1} aria-label={`Remove line ${idx + 1}`} className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="ghost" className="mt-2 text-brand-700" onClick={() => append(blankItem())}>
          <Plus className="size-4" /> Add line
        </Button>

        <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <Row label="Taxable value" value={rupees(totals.taxable)} />
          {intra ? (
            <>
              <Row label="CGST" value={rupees(totals.cgst)} />
              <Row label="SGST" value={rupees(totals.sgst)} />
            </>
          ) : (
            <Row label="IGST" value={rupees(totals.igst)} />
          )}
          {totals.roundOff !== 0 && <Row label="Round off" value={rupees(totals.roundOff)} />}
          <div className="flex justify-between border-t-2 border-brand-700 pt-1.5 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              <Money value={rupees(totals.total)} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <TextAreaField label="Notes (printed)" rows={3} {...register('notes')} />
        <TextAreaField label="Terms" rows={3} hint={doc ? undefined : 'Leave blank to use the default terms from Settings.'} {...register('terms')} />
      </section>

      <FormError error={save.error} />
      {!client && <p className="text-sm text-amber-700">Choose a client to save.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!client} loading={save.isPending}>
          {doc ? 'Save changes' : kind === 'invoice' ? 'Save draft invoice' : 'Save quotation'}
        </Button>
      </div>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  )
}
