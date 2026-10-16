import { Paperclip, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, todayISO } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { CheckboxField, SelectField, TextField } from '@/shared/ui/Field'
import { DateField } from '@/shared/ui/DateField'
import { Modal } from '@/shared/ui/Modal'

import { useBookings } from '../crm/api'
import { EmptyState, FormError, Pagination, QueryState, TABLE, TABLE_WRAP, THEAD } from '../kit'
import { useVendors } from '../ops/api'
import { accounts, useAccountsMutation, useExpenses, useLedgers, useTaxRates, type Expense } from './api'
import { previewLine, rupees } from './calc'
import { Money } from './ui'

const PAGE_SIZE = 25

export function ExpensesPage() {
  const { hasRole } = useAuth()
  const canWrite = hasRole('OWNER', 'ACCOUNTANT')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [head, setHead] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Expense | 'new' | null>(null)
  const { data: heads } = useLedgers({ kind: 'expense' })

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])
  const { data, isLoading, error } = useExpenses({ search: debounced, expense_ledger: head, page, page_size: PAGE_SIZE, ordering: '-date' })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search expenses</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, bill no., vendor…" className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm" />
        </label>
        <select aria-label="Expense head" value={head} onChange={(e) => { setHead(e.target.value); setPage(1) }} className="rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm">
          <option value="">All expense heads</option>
          {heads?.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        {canWrite && (
          <Button className="ml-auto" onClick={() => setOpen('new')}>
            <Plus className="size-4" /> Add expense
          </Button>
        )}
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No expenses recorded.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Head</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Paid from</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((e) => (
                  <tr key={e.id} className={e.is_cancelled ? 'opacity-50' : 'hover:bg-brand-50'}>
                    <td className="px-4 py-3">
                      <button onClick={() => canWrite && !e.is_cancelled && setOpen(e)} className="text-left font-medium text-brand-800 hover:underline disabled:no-underline" disabled={!canWrite || e.is_cancelled}>
                        {e.description}
                      </button>
                      {e.attachment && <Paperclip className="ml-1 inline size-3.5 text-stone-400" aria-label="Bill attached" />}
                      <span className="block text-xs text-stone-500">
                        {e.number} · {fmtDate(e.date)}
                        {e.vendor_name && ` · ${e.vendor_name}`}
                        {e.is_cancelled && <span className="text-red-700"> · Cancelled</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">{e.expense_ledger_name}</td>
                    <td className="px-4 py-3 text-xs">{e.booking ? <Link to={`/admin/events/${e.booking}`} className="text-brand-700 hover:underline">{e.booking_title}</Link> : '—'}</td>
                    <td className="px-4 py-3">{e.paid_from_name ?? <span className="text-amber-700">On credit</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <Money value={e.total} />
                      {Number(e.total) !== Number(e.amount) && <span className="block text-xs text-stone-500">incl. GST</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
      <Modal wide open={open !== null} title={open === 'new' ? 'Add expense' : 'Edit expense'} onClose={() => setOpen(null)}>
        {open !== null && <ExpenseForm expense={open === 'new' ? undefined : open} onDone={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}

export function ExpenseForm({ expense, presetBooking, onDone }: { expense?: Expense; presetBooking?: number; onDone: () => void }) {
  const { data: heads } = useLedgers({ kind: 'expense' })
  const { data: cashBank } = useLedgers({ kind: 'cash_bank' })
  const { data: vendors } = useVendors({ page_size: 500, is_active: true })
  const { data: taxRates } = useTaxRates()
  const { data: events } = useBookings({ page_size: 100, ordering: '-event_date' })
  const save = useAccountsMutation(accounts.saveExpense)
  const cancel = useAccountsMutation(accounts.cancelExpense)

  const [f, setF] = useState({
    date: expense?.date ?? todayISO(),
    expense_ledger: String(expense?.expense_ledger ?? ''),
    description: expense?.description ?? '',
    amount: expense?.amount ?? '',
    tax_rate: String(Number(expense?.tax_rate ?? 0)),
    is_interstate: expense?.is_interstate ?? false,
    vendor: String(expense?.vendor ?? ''),
    booking: String(expense?.booking ?? presetBooking ?? ''),
    bill_number: expense?.bill_number ?? '',
    paid_from: expense ? String(expense.paid_from ?? '') : 'default',
  })
  const [file, setFile] = useState<File | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const cash = cashBank?.find((l) => l.system_code === 'CASH')
  const paidFrom = f.paid_from === 'default' ? String(cash?.id ?? '') : f.paid_from
  const preview = previewLine({ quantity: '1', rate: f.amount || '0', discount: '0', tax_rate: f.tax_rate }, !f.is_interstate)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = new FormData()
    data.append('date', f.date)
    data.append('expense_ledger', f.expense_ledger)
    data.append('description', f.description)
    data.append('amount', f.amount)
    data.append('tax_rate', f.tax_rate)
    data.append('is_interstate', String(f.is_interstate))
    data.append('bill_number', f.bill_number)
    // Multipart has no null: an empty string clears a relation.
    data.append('vendor', f.vendor)
    data.append('booking', f.booking)
    data.append('paid_from', paidFrom)
    if (file) data.append('attachment', file)
    save.mutate({ id: expense?.id, data }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <DateField label="Date" required value={f.date} onChange={(value) => set('date')({ target: { value } })} />
      <SelectField
        label="Expense head *"
        required
        options={[{ value: '', label: 'Choose…' }, ...(heads ?? []).map((h) => ({ value: String(h.id), label: `${h.name} (${h.group_name})` }))]}
        value={f.expense_ledger}
        onChange={set('expense_ledger')}
      />
      <TextField label="Description *" required className="sm:col-span-2" placeholder="e.g. Roses and jasmine for Kavya's wedding" value={f.description} onChange={set('description')} />
      <TextField label="Amount before GST (₹) *" type="number" step="0.01" min="0.01" required value={f.amount} onChange={set('amount')} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="GST on bill" options={[{ value: '0', label: 'No GST' }, ...(taxRates ?? []).filter((t) => Number(t.rate) > 0).map((t) => ({ value: String(Number(t.rate)), label: `${Number(t.rate)}%` }))]} value={f.tax_rate} onChange={set('tax_rate')} />
        <CheckboxField label="Other-state vendor (IGST)" className="pt-7" checked={f.is_interstate} onChange={(e) => setF({ ...f, is_interstate: e.target.checked })} />
      </div>
      <SelectField label="Vendor" options={[{ value: '', label: 'No vendor' }, ...(vendors?.results ?? []).map((v) => ({ value: String(v.id), label: v.name }))]} value={f.vendor} onChange={set('vendor')} />
      <TextField label="Vendor bill no." value={f.bill_number} onChange={set('bill_number')} />
      <SelectField
        label="Paid from"
        hint={!paidFrom ? 'On credit: shows as owed to the vendor until you record a payment voucher.' : undefined}
        options={[...(cashBank ?? []).map((l) => ({ value: String(l.id), label: l.name })), { value: '', label: 'Not paid yet (owed to vendor)' }]}
        value={paidFrom}
        onChange={set('paid_from')}
      />
      <SelectField label="For event (optional)" options={[{ value: '', label: 'General / overhead' }, ...(events?.results ?? []).map((b) => ({ value: String(b.id), label: `${b.number} · ${b.title}` }))]} value={f.booking} onChange={set('booking')} />
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="bill-file">
          Bill / receipt (PDF or photo)
        </label>
        <input id="bill-file" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        {expense?.attachment && !file && (
          <a href={expense.attachment} target="_blank" rel="noopener" className="ml-2 text-xs text-brand-700 hover:underline">
            View current attachment
          </a>
        )}
      </div>
      <dl className="rounded-lg bg-stone-50 p-3 text-sm sm:col-span-2">
        <div className="flex flex-wrap justify-between gap-2">
          <span>
            {f.is_interstate ? `IGST ${rupees(preview.igst)}` : `CGST ${rupees(preview.cgst)} + SGST ${rupees(preview.sgst)}`}
          </span>
          <strong>
            Total <Money value={rupees(preview.amount)} />
          </strong>
        </div>
      </dl>
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error ?? cancel.error} />
        <div className="flex items-center justify-end gap-2">
          {expense && (
            <Button type="button" variant="ghost" className="mr-auto text-red-600" loading={cancel.isPending} onClick={() => cancel.mutate(expense.id, { onSuccess: onDone })}>
              Cancel this expense
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onDone}>
            Close
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
