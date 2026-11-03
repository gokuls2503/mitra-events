import { Plus, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { todayISO } from '@/shared/dates'
import { prettyPhone } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { DateField } from '@/shared/ui/DateField'
import { MultiSelectField } from '@/shared/ui/MultiSelectField'

import { useBookings, type Client } from '../crm/api'
import { EVENT_TYPES } from '../crm/labels'
import { FormError } from '../kit'
import { accounts, useAccountsMutation, useSettings, useTaxRates, type Invoice, type Item, type Quotation } from './api'
import { previewLine, previewTotals, rupees } from './calc'
import { QuotationImages } from './QuotationImages'
import { photosOf, syncQuotationImages, type PhotoDraft } from './quotationPhotos'
import { ClientPicker, Money } from './ui'

type Kind = 'invoice' | 'quotation'

interface Values {
  date: string
  second_date: string // due date (invoice) or valid until (quotation)
  place_of_supply: string
  booking: string
  event_types: string[] // quotations only
  notes: string
  terms: string
  items: Item[]
}

export interface Prefill {
  client?: Pick<Client, 'id' | 'name' | 'phone'> | null
  booking?: number | null
  items?: Item[]
  /** A quotation started from a lead: linked to it, and without a client the lead's client is found or created on save. */
  lead?: { id: number; name: string; phone: string; eventTypes?: string[] }
}

export function DocumentEditor({ kind, doc, prefill }: { kind: Kind; doc?: Invoice | Quotation; prefill?: Prefill }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: settings } = useSettings()
  // Quotation photos: edited locally, applied after the quotation itself saves.
  const [savedPhotos] = useState<PhotoDraft[]>(() => photosOf(doc && 'images' in doc ? doc.images : []))
  const [photos, setPhotos] = useState<PhotoDraft[]>(savedPhotos)
  const [photoSync, setPhotoSync] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null })
  const { data: taxRates } = useTaxRates()
  const [client, setClient] = useState<Pick<Client, 'id' | 'name' | 'phone'> | null>(
    doc ? { id: doc.client, name: doc.client_name, phone: doc.client_phone } : prefill?.client ?? null,
  )
  const lead = doc ? undefined : prefill?.lead
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
      event_types: doc && 'event_types' in doc ? doc.event_types : prefill?.lead?.eventTypes ?? [],
      notes: doc?.notes ?? '',
      terms: doc?.terms ?? '',
      items: doc?.items.map((i) => ({ ...i, tax_rate: String(Number(i.tax_rate)) })) ?? prefill?.items ?? (kind === 'invoice' ? [blankItem()] : []), // a new quotation starts empty: lines come from Add line
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = useWatch({ control, name: 'items' })
  const place = useWatch({ control, name: 'place_of_supply' })
  // Controlled: the event list loads after the form, and an uncontrolled <select> would show
  // the first option instead of the pre-filled event.
  const bookingValue = useWatch({ control, name: 'booking' })
  const eventTypes = useWatch({ control, name: 'event_types' })
  const intra = place === (settings?.state_code ?? '33')

  const totals = previewTotals(items, intra)

  // Invoices need SAC, quantity and unit for GST; a quotation's lines keep the defaults without showing them.
  const isInvoice = kind === 'invoice'
  const canSave = Boolean((client || lead) && fields.length)
  const [pickingClient, setPickingClient] = useState(false)

  const submit = (v: Values) => {
    const body: Record<string, unknown> = {
      id: doc?.id,
      client: client?.id,
      ...(lead && { lead: lead.id }),
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
      body.event_types = v.event_types
      if (v.second_date) body.valid_until = v.second_date
    }
    save.mutate(body, {
      onSuccess: async (saved) => {
        if (kind === 'quotation') {
          setPhotoSync({ busy: true, error: null })
          try {
            await syncQuotationImages(saved.id, savedPhotos, photos)
          } catch (error) {
            setPhotoSync({ busy: false, error })
            return
          }
          void queryClient.invalidateQueries({ queryKey: ['accounts'] })
        }
        // The lead now has a client, a new stage and a timeline entry.
        if (lead) void queryClient.invalidateQueries({ queryKey: ['crm'] })
        navigate(`/admin/accounts/${kind}s/${saved.id}`)
      },
    })
  }

  // A quotation has no event box: its event comes from the lead or booking, so it can't stay on another client.
  const pickClient = (next: Pick<Client, 'id' | 'name' | 'phone'> | null) => {
    setClient(next)
    if (!isInvoice) setValue('booking', '', { shouldDirty: true })
  }

  const taxOptions = (taxRates ?? []).filter((t) => t.is_active).map((t) => ({ value: String(Number(t.rate)), label: `${Number(t.rate)}%` }))
  const stateOptions = (settings?.states ?? []).map((s) => ({ value: s.code, label: `${s.code} - ${s.name}` }))

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          {lead && !client && !pickingClient ? (
            // Shown as chosen; Change opens the search. The client itself is found or created on save.
            <ClientPicker value={{ id: 0, name: lead.name, phone: lead.phone }} onChange={() => setPickingClient(true)} hidePhone />
          ) : (
            <ClientPicker value={client} onChange={pickClient} disabled={!!doc} hidePhone />
          )}
          {lead && !client && (
            <p className="mt-2 rounded-lg bg-gold-100 px-3 py-2 text-sm text-gold-700">
              From lead <span className="font-medium">{lead.name}</span>. They'll be added as a client when you save
              {pickingClient ? ', or pick an existing client above.' : '.'}
            </p>
          )}
        </div>
        <TextField label="Client number" readOnly tabIndex={-1} value={prettyPhone((client ?? lead)?.phone ?? '')} className="[&_input]:bg-stone-50" />
        {kind === 'quotation' && (
          <div>
            <MultiSelectField label="Event type" placeholder="Not specified" options={EVENT_TYPES} value={eventTypes} onChange={(v) => setValue('event_types', v, { shouldDirty: true })} />
            <p className="mt-1 text-xs text-stone-500">Printed under EVENT on the quotation.</p>
          </div>
        )}
        {isInvoice && (
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
        )}
        <SelectField label="Place of supply" options={stateOptions.length ? stateOptions : [{ value: '33', label: '33 - Tamil Nadu' }]} hint={intra ? 'Same state: CGST + SGST' : 'Other state: IGST'} {...register('place_of_supply')} />
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DateField label={kind === 'invoice' ? 'Invoice date' : 'Quotation date'} required value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          )}
        />
        <Controller
          control={control}
          name="second_date"
          render={({ field }) => (
            <DateField
              label={kind === 'invoice' ? 'Due date' : 'Valid until'}
              hint={doc ? undefined : `Leave blank for ${kind === 'invoice' ? settings?.invoice_due_days ?? 7 : settings?.quotation_valid_days ?? 15} days`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Items</h2>
        <div className="overflow-x-auto">
          <table className={clsx('w-full text-sm', isInvoice ? 'min-w-[56rem]' : 'min-w-[40rem]')}>
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className={clsx('pb-2 font-medium', isInvoice && 'w-[34%]')}>Description</th>
                {isInvoice && (
                  <>
                    <th className="pb-2 font-medium">SAC</th>
                    <th className="pb-2 font-medium">Qty</th>
                    <th className="pb-2 font-medium">Unit</th>
                  </>
                )}
                <th className="pb-2 font-medium">Rate (₹)</th>
                <th className="pb-2 font-medium">Discount (₹)</th>
                <th className="pb-2 font-medium">GST</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!fields.length && (
                <tr>
                  <td colSpan={9} className="py-3 text-stone-500">
                    No lines yet. Use Add line to start.
                  </td>
                </tr>
              )}
              {fields.map((f, idx) => {
                const line = items[idx] ? previewLine(items[idx], intra) : null
                const cell = 'w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none'
                return (
                  <tr key={f.id} className="align-top">
                    <td className="py-1 pr-2">
                      <input aria-label={`Line ${idx + 1} description`} required className={cell} placeholder="e.g. Reception stage decor" {...register(`items.${idx}.description`)} />
                    </td>
                    {isInvoice && (
                      <>
                        <td className="w-24 py-1 pr-2">
                          <input aria-label={`Line ${idx + 1} SAC`} className={cell} {...register(`items.${idx}.sac`)} />
                        </td>
                        <td className="w-20 py-1 pr-2">
                          <input aria-label={`Line ${idx + 1} quantity`} type="number" step="0.01" min="0.01" required className={cell} {...register(`items.${idx}.quantity`)} />
                        </td>
                        <td className="w-20 py-1 pr-2">
                          <input aria-label={`Line ${idx + 1} unit`} className={cell} {...register(`items.${idx}.unit`)} />
                        </td>
                      </>
                    )}
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
                      <button type="button" onClick={() => remove(idx)} disabled={isInvoice && fields.length === 1} aria-label={`Remove line ${idx + 1}`} className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
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

      {kind === 'quotation' && <QuotationImages value={photos} onChange={setPhotos} />}

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <TextAreaField label="Notes (printed)" rows={3} {...register('notes')} />
        {isInvoice ? (
          <TextAreaField label="Terms" rows={3} hint={doc ? undefined : 'Leave blank to use the default terms from Settings.'} {...register('terms')} />
        ) : (
          <div>
            <p className="mb-1 text-sm font-medium text-stone-700">Terms and conditions</p>
            <p className="text-sm whitespace-pre-line text-stone-700">{doc?.terms || settings?.quotation_terms}</p>
          </div>
        )}
      </section>

      <FormError error={save.error ?? photoSync.error} />
      {photoSync.error != null && <p className="text-sm text-amber-700">The quotation was saved, but an image couldn't be uploaded. Try saving again.</p>}
      {!canSave && <p className="text-sm text-amber-700">{client || lead ? 'Add a line to save.' : 'Choose a client to save.'}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave} loading={save.isPending || photoSync.busy}>
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
