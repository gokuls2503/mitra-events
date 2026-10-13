import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/shared/ui/Field'

import { FormError, QueryState } from '../kit'
import { accounts, useAccountsMutation, useSettings, useTaxRates, type CompanyProfile } from './api'

export function SettingsPage() {
  const { data, isLoading, error } = useSettings()
  if (!data) return <QueryState isLoading={isLoading} error={error} />
  return (
    <div className="space-y-6">
      <CompanyForm profile={data} />
      <TaxRates />
    </div>
  )
}

function CompanyForm({ profile }: { profile: CompanyProfile }) {
  const { hasRole } = useAuth()
  const canWrite = hasRole('OWNER', 'ACCOUNTANT')
  const { data: taxRates } = useTaxRates()
  const save = useAccountsMutation(accounts.saveSettings)
  const { register, handleSubmit, reset, formState } = useForm<CompanyProfile>({ defaultValues: { ...profile, default_tax_rate: profile.default_tax_rate } })

  return (
    <form
      onSubmit={handleSubmit((v) =>
        save.mutate(
          { ...v, default_tax_rate: v.default_tax_rate ? Number(v.default_tax_rate) : null, states: undefined } as Partial<CompanyProfile>,
          { onSuccess: (saved) => reset(saved) },
        ),
      )}
      className="space-y-6"
    >
      <fieldset disabled={!canWrite} className="space-y-6">
        <Section title="Business & GST" intro="Printed on every invoice, quotation and receipt.">
          <TextField label="Legal name *" required {...register('legal_name')} />
          <TextField label="Trade / brand name" hint="Shown large on documents if set." {...register('trade_name')} />
          <TextField label="GSTIN" maxLength={15} placeholder="33XXXXXXXXXXXXX" hint="Required before issuing invoices." {...register('gstin')} />
          <TextField label="PAN" maxLength={10} {...register('pan')} />
          <SelectField label="State (for GST)" options={profile.states.map((s) => ({ value: s.code, label: `${s.code} - ${s.name}` }))} {...register('state_code')} />
          <TextField label="Phone" {...register('phone')} />
          <TextField label="Email" type="email" {...register('email')} />
          <TextField label="Authorised signatory" placeholder="Name printed under the signature" {...register('authorised_signatory')} />
          <TextAreaField label="Address" rows={3} className="sm:col-span-2" {...register('address')} />
        </Section>

        <Section title="Bank & UPI" intro="Shown on invoices so clients know where to pay.">
          <TextField label="Bank name" {...register('bank_name')} />
          <TextField label="Branch" {...register('bank_branch')} />
          <TextField label="Account name" {...register('bank_account_name')} />
          <TextField label="Account number" {...register('bank_account_number')} />
          <TextField label="IFSC" maxLength={11} {...register('bank_ifsc')} />
          <TextField label="UPI ID" placeholder="name@bank" {...register('upi_id')} />
        </Section>

        <Section title="Numbering & defaults" intro="Numbers look like PREFIX/2026-27/0001 and restart every April. Changing a prefix only affects new documents.">
          <TextField label="Invoice prefix" {...register('invoice_prefix')} />
          <TextField label="Quotation prefix" {...register('quotation_prefix')} />
          <TextField label="Receipt prefix" {...register('receipt_prefix')} />
          <TextField label="Expense prefix" {...register('expense_prefix')} />
          <TextField label="Voucher prefix" {...register('voucher_prefix')} />
          <TextField label="Default SAC code" hint="998596 = event services" {...register('default_sac')} />
          <SelectField label="Default GST rate" options={(taxRates ?? []).filter((t) => t.is_active).map((t) => ({ value: String(t.id), label: t.name }))} {...register('default_tax_rate')} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Invoice due (days)" type="number" min={0} {...register('invoice_due_days')} />
            <TextField label="Quote valid (days)" type="number" min={1} {...register('quotation_valid_days')} />
          </div>
        </Section>

        <Section title="Terms" intro="Default terms for new documents (each document can be edited).">
          <TextAreaField label="Invoice terms" rows={4} {...register('invoice_terms')} />
          <TextAreaField label="Quotation terms" rows={4} {...register('quotation_terms')} />
        </Section>
      </fieldset>
      <FormError error={save.error} />
      {canWrite && (
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-stone-200 bg-stone-50/95 py-3 backdrop-blur">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
          {save.isSuccess && !formState.isDirty && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      )}
    </form>
  )
}

function Section({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-sans text-sm font-semibold text-stone-900">{title}</h2>
      <p className="mb-4 text-xs text-stone-500">{intro}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function TaxRates() {
  const { hasRole } = useAuth()
  const { data } = useTaxRates()
  const save = useAccountsMutation(accounts.saveTaxRate)
  const [rate, setRate] = useState('')
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-sans text-sm font-semibold text-stone-900">GST rates</h2>
      <p className="mb-4 text-xs text-stone-500">Rates offered on invoice lines and expenses. Turn off rates you don't use.</p>
      <ul className="flex flex-wrap gap-3">
        {data?.map((t) => (
          <li key={t.id} className="rounded-lg border border-stone-200 px-3 py-2">
            <CheckboxField
              label={t.name}
              checked={t.is_active}
              disabled={!hasRole('OWNER', 'ACCOUNTANT')}
              onChange={(e) => save.mutate({ id: t.id, is_active: e.target.checked })}
            />
          </li>
        ))}
      </ul>
      {hasRole('OWNER', 'ACCOUNTANT') && (
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({ name: `GST ${Number(rate)}%`, rate, is_active: true }, { onSuccess: () => setRate('') })
          }}
        >
          <TextField label="Add a rate (%)" type="number" step="0.01" min="0" max="28" value={rate} onChange={(e) => setRate(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!rate} loading={save.isPending}>
            Add
          </Button>
        </form>
      )}
      <FormError error={save.error} />
    </section>
  )
}
