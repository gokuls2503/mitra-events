import { Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, todayISO } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import type { Client } from '../crm/api'
import { EmptyState, FormError, Pagination, QueryState, TABLE, TABLE_WRAP, THEAD } from '../kit'
import { accounts, RECEIPT_MODES, useAccountsMutation, useInvoices, useLedgers, useReceipts, type Invoice, type Receipt, type ReceiptMode } from './api'
import { ClientPicker, FileButton, Money } from './ui'

const PAGE_SIZE = 25

export function ReceiptsPage() {
  const { hasRole } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [applying, setApplying] = useState<Receipt | null>(null)
  const cancel = useAccountsMutation(accounts.cancelReceipt)
  const canWrite = hasRole('OWNER', 'ACCOUNTANT')

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])
  const { data, isLoading, error } = useReceipts({ search: debounced, page, page_size: PAGE_SIZE, ordering: '-date' })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search receipts</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, client, reference…" className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm" />
        </label>
        {canWrite && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Record payment
          </Button>
        )}
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No payments received yet.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Applied to</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((r) => (
                  <tr key={r.id} className={r.is_cancelled ? 'opacity-50' : 'hover:bg-brand-50'}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.number}</span>
                      {r.is_cancelled && <span className="ml-2 text-xs text-red-700">Cancelled</span>}
                      <span className="block text-xs text-stone-500">{fmtDate(r.date)}</span>
                    </td>
                    <td className="px-4 py-3">{r.client_name}</td>
                    <td className="px-4 py-3">
                      {r.mode_label}
                      <span className="block text-xs text-stone-500">
                        {r.deposit_to_name}
                        {r.reference && ` · ${r.reference}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money value={r.amount} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.allocations.map((a) => (
                        <Link key={a.id} to={`/admin/accounts/invoices/${a.invoice}`} className="mr-2 text-brand-700 hover:underline">
                          {a.invoice_number}
                        </Link>
                      ))}
                      {!r.is_cancelled && Number(r.unapplied) > 0 && (
                        <span className="text-amber-700">
                          <Money value={r.unapplied} /> advance
                          {canWrite && (
                            <button onClick={() => setApplying(r)} className="ml-1 text-brand-700 underline">
                              apply
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <FileButton url={`/accounts/receipts/${r.id}/pdf/`} label="PDF" />
                        {canWrite && !r.is_cancelled && <CancelReceipt onCancel={() => cancel.mutate(r.id)} pending={cancel.isPending} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
      <FormError error={cancel.error} />
      <Modal wide open={adding} title="Record payment received" onClose={() => setAdding(false)}>
        {adding && <ReceiptForm onDone={() => setAdding(false)} />}
      </Modal>
      <Modal wide open={applying !== null} title={`Apply advance — ${applying?.number}`} onClose={() => setApplying(null)}>
        {applying && <ApplyAdvance receipt={applying} onDone={() => setApplying(null)} />}
      </Modal>
    </div>
  )
}

function CancelReceipt({ onCancel, pending }: { onCancel: () => void; pending: boolean }) {
  const [armed, setArmed] = useState(false)
  return armed ? (
    <span className="flex items-center gap-1 text-xs">
      <Button variant="danger" className="px-2 py-1 text-xs" loading={pending} onClick={onCancel}>
        Cancel receipt
      </Button>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setArmed(false)}>
        No
      </Button>
    </span>
  ) : (
    <Button variant="ghost" className="text-xs text-red-600" onClick={() => setArmed(true)}>
      Cancel
    </Button>
  )
}

/** Open invoices of a client, with an amount box each — auto-filled oldest first. */
function AllocationTable({
  invoices,
  amounts,
  setAmounts,
}: {
  invoices: Invoice[]
  amounts: Record<number, string>
  setAmounts: (a: Record<number, string>) => void
}) {
  if (!invoices.length) return <p className="text-sm text-stone-500">No unpaid invoices — the full amount will be kept as an advance.</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-stone-500">
        <tr>
          <th className="py-1 font-medium">Invoice</th>
          <th className="py-1 text-right font-medium">Balance due</th>
          <th className="py-1 text-right font-medium">Apply (₹)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td className="py-1.5">
              {inv.number} <span className="text-xs text-stone-500">{fmtDate(inv.invoice_date)}</span>
            </td>
            <td className="py-1.5 text-right">
              <Money value={inv.balance_due} />
            </td>
            <td className="w-36 py-1.5 pl-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max={inv.balance_due}
                aria-label={`Amount for ${inv.number}`}
                value={amounts[inv.id] ?? ''}
                onChange={(e) => setAmounts({ ...amounts, [inv.id]: e.target.value })}
                className="w-full rounded-md border border-stone-300 px-2 py-1 text-right"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function autoAllocate(invoices: Invoice[], amount: number): Record<number, string> {
  let left = Math.round(amount * 100)
  const out: Record<number, string> = {}
  for (const inv of [...invoices].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))) {
    const due = Math.round(Number(inv.balance_due) * 100)
    const take = Math.min(due, left)
    if (take > 0) out[inv.id] = (take / 100).toFixed(2)
    left -= take
  }
  return out
}

export function ReceiptForm({
  presetClient,
  presetInvoice,
  presetBooking,
  onDone,
}: {
  presetClient?: Pick<Client, 'id' | 'name' | 'phone'>
  presetInvoice?: Invoice
  presetBooking?: number | null
  onDone: () => void
}) {
  const [client, setClient] = useState<Pick<Client, 'id' | 'name' | 'phone'> | null>(presetClient ?? null)
  const [amount, setAmount] = useState(presetInvoice ? presetInvoice.balance_due : '')
  const [date, setDate] = useState(todayISO())
  const [mode, setMode] = useState<ReceiptMode>('UPI')
  const [depositTo, setDepositTo] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState<Record<number, string>>(presetInvoice ? { [presetInvoice.id]: presetInvoice.balance_due } : {})
  const { data: cashBank } = useLedgers({ kind: 'cash_bank' })
  const { data: open } = useInvoices({ client: client?.id, open: true, page_size: 100, ordering: 'invoice_date' })
  const create = useAccountsMutation(accounts.createReceipt)
  const openInvoices = client ? open?.results ?? [] : []

  // Default the deposit ledger from the mode: cash → Cash, anything else → first bank.
  const cashLedger = cashBank?.find((l) => l.system_code === 'CASH')
  const bankLedger = cashBank?.find((l) => l.system_code !== 'CASH')
  const effectiveDeposit = depositTo || String((mode === 'CASH' ? cashLedger : bankLedger ?? cashLedger)?.id ?? '')
  const applied = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0)
  const advance = (Number(amount) || 0) - applied

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate(
          {
            client: client?.id,
            booking: presetBooking ?? null,
            amount,
            date,
            mode,
            deposit_to: Number(effectiveDeposit),
            reference,
            notes,
            apply_to: Object.entries(amounts)
              .filter(([, v]) => Number(v) > 0)
              .map(([invoice, v]) => ({ invoice: Number(invoice), amount: v })),
          },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ClientPicker value={client} onChange={(c) => { setClient(c); setAmounts({}) }} disabled={!!presetClient} />
        <TextField
          label="Amount received (₹) *"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            if (!presetInvoice) setAmounts(autoAllocate(openInvoices, Number(e.target.value) || 0))
          }}
        />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label="Mode" options={RECEIPT_MODES} value={mode} onChange={(e) => { setMode(e.target.value as ReceiptMode); setDepositTo('') }} />
        <SelectField
          label="Received into"
          options={(cashBank ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
          value={effectiveDeposit}
          onChange={(e) => setDepositTo(e.target.value)}
        />
        <TextField label="Reference" placeholder="UPI ref / UTR / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      {client && (
        <fieldset className="rounded-lg border border-stone-200 p-3">
          <legend className="px-1 text-sm font-medium">Apply to invoices</legend>
          <AllocationTable invoices={openInvoices} amounts={amounts} setAmounts={setAmounts} />
          {Number(amount) > 0 && (
            <p className={advance < -0.001 ? 'mt-2 text-sm text-red-600' : 'mt-2 text-xs text-stone-500'}>
              {advance < -0.001 ? 'You have applied more than the amount received.' : advance > 0.001 ? `₹${advance.toFixed(2)} will be kept as an advance for future invoices.` : 'Fully applied.'}
            </p>
          )}
        </fieldset>
      )}
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!client || advance < -0.001} loading={create.isPending}>
          Save receipt
        </Button>
      </div>
    </form>
  )
}

function ApplyAdvance({ receipt, onDone }: { receipt: Receipt; onDone: () => void }) {
  const { data: open } = useInvoices({ client: receipt.client, open: true, page_size: 100, ordering: 'invoice_date' })
  const invoices = open?.results ?? []
  const [amounts, setAmounts] = useState<Record<number, string> | null>(null)
  const allocate = useAccountsMutation(accounts.allocateReceipt)
  const current = amounts ?? autoAllocate(invoices, Number(receipt.unapplied))

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Money value={receipt.unapplied} /> from {receipt.client_name} is not yet applied to any invoice.
      </p>
      <AllocationTable invoices={invoices} amounts={current} setAmounts={setAmounts} />
      <FormError error={allocate.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!invoices.length}
          loading={allocate.isPending}
          onClick={() =>
            allocate.mutate(
              { id: receipt.id, apply_to: Object.entries(current).filter(([, v]) => Number(v) > 0).map(([invoice, v]) => ({ invoice: Number(invoice), amount: v })) },
              { onSuccess: onDone },
            )
          }
        >
          Apply
        </Button>
      </div>
    </div>
  )
}
