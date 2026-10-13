import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, todayISO } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { EmptyState, FormError, Pagination, QueryState } from '../kit'
import { accounts, useAccountsMutation, useLedgers, useVouchers, VOUCHER_TYPES, type JournalEntry, type VoucherType } from './api'
import { fyStartISO } from './format'
import { FileButton, Money } from './ui'

const PAGE_SIZE = 30
const SOURCE_LINK = { invoice: 'invoices', receipt: 'receipts', expense: 'expenses' } as const

export function VouchersPage() {
  const { hasRole } = useAuth()
  const canWrite = hasRole('OWNER', 'ACCOUNTANT')
  const [from, setFrom] = useState(fyStartISO())
  const [to, setTo] = useState(todayISO())
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const cancel = useAccountsMutation(accounts.cancelVoucher)
  const { data, isLoading, error } = useVouchers({ date_from: from, date_to: to, voucher_type: type, page, page_size: PAGE_SIZE })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <TextField label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        <TextField label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        <SelectField label="Type" options={[{ value: '', label: 'All vouchers' }, ...VOUCHER_TYPES]} value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} />
        <div className="ml-auto flex gap-2">
          {hasRole('OWNER', 'ACCOUNTANT') && <FileButton kind="xlsx" url="/accounts/reports/day-book/" params={{ from, to, export: 'xlsx' }} label="Day book" />}
          {canWrite && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> New voucher
            </Button>
          )}
        </div>
      </div>
      <p className="mb-3 text-xs text-stone-500">
        Every invoice, receipt and expense posts a voucher automatically. Use manual vouchers for anything else — paying a vendor, moving cash to the bank, owner's capital, adjustments.
      </p>
      <QueryState isLoading={isLoading} error={error} />
      <FormError error={cancel.error} />
      {data && data.results.length === 0 && <EmptyState>No vouchers in this period.</EmptyState>}
      <ul className="space-y-2">
        {data?.results.map((v) => (
          <VoucherCard key={v.id} v={v} canCancel={canWrite && v.is_manual && !v.is_cancelled} onCancel={() => cancel.mutate(v.id)} />
        ))}
      </ul>
      {data && data.count > 0 && <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />}
      <Modal wide open={adding} title="New voucher" onClose={() => setAdding(false)}>
        {adding && <VoucherForm onDone={() => setAdding(false)} />}
      </Modal>
    </div>
  )
}

function VoucherCard({ v, canCancel, onCancel }: { v: JournalEntry; canCancel: boolean; onCancel: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <li className={clsx('rounded-lg border border-stone-200 bg-white p-3 text-sm', v.is_cancelled && 'opacity-50')}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="w-24 text-stone-500">{fmtDate(v.date)}</span>
        <span className="font-medium">{v.voucher_type_label}</span>
        {v.source ? (
          <Link to={`/admin/accounts/${SOURCE_LINK[v.source.kind]}${v.source.kind === 'invoice' ? `/${v.source.id}` : ''}`} className="text-brand-700 hover:underline">
            {v.number}
          </Link>
        ) : (
          <span className="text-stone-600">{v.number}</span>
        )}
        {v.is_cancelled && <span className="text-xs text-red-700">Cancelled</span>}
        <span className="ml-auto">
          <Money value={v.total} />
        </span>
      </div>
      {v.narration && <p className="mt-0.5 text-xs text-stone-500">{v.narration}</p>}
      <table className="mt-2 w-full text-xs">
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.id}>
              <td className={clsx('py-0.5', Number(l.credit) && 'pl-6')}>
                {Number(l.debit) ? 'Dr ' : 'Cr '}
                <Link to={`/admin/accounts/ledgers/${l.ledger}`} className="hover:underline">
                  {l.ledger_name}
                </Link>
              </td>
              <td className="w-28 text-right">{Number(l.debit) ? <Money value={l.debit} /> : ''}</td>
              <td className="w-28 text-right">{Number(l.credit) ? <Money value={l.credit} /> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canCancel && (
        <div className="mt-2 text-right">
          {armed ? (
            <span className="inline-flex gap-1">
              <Button variant="danger" className="px-2 py-1 text-xs" onClick={onCancel}>
                Cancel voucher
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setArmed(false)}>
                No
              </Button>
            </span>
          ) : (
            <button onClick={() => setArmed(true)} className="text-xs text-red-600 hover:underline">
              Cancel
            </button>
          )}
        </div>
      )}
    </li>
  )
}

interface LineInput {
  ledger: string
  debit: string
  credit: string
}

const HINTS: Partial<Record<VoucherType, string>> = {
  PAYMENT: 'Money paid out: Dr the person or expense, Cr cash/bank. E.g. paying a vendor: Dr vendor, Cr Bank.',
  RECEIPT: 'Money received not against an invoice: Dr cash/bank, Cr the source (e.g. a loan or capital).',
  CONTRA: 'Moving money between cash and bank: e.g. depositing cash — Dr Bank, Cr Cash.',
  JOURNAL: 'Adjustments that involve no cash or bank.',
  PURCHASE: 'Prefer “Expenses” for bills — use this only for unusual purchase entries.',
}

function VoucherForm({ onDone }: { onDone: () => void }) {
  const { data: ledgers } = useLedgers({ is_active: true })
  const create = useAccountsMutation(accounts.createVoucher)
  const [type, setType] = useState<VoucherType>('PAYMENT')
  const [date, setDate] = useState(todayISO())
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<LineInput[]>([
    { ledger: '', debit: '', credit: '' },
    { ledger: '', debit: '', credit: '' },
  ])
  const update = (i: number, patch: Partial<LineInput>) => setLines(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  const dr = lines.reduce((s, l) => s + Math.round((Number(l.debit) || 0) * 100), 0)
  const cr = lines.reduce((s, l) => s + Math.round((Number(l.credit) || 0) * 100), 0)
  const balanced = dr > 0 && dr === cr
  const ledgerOptions = [{ value: '', label: 'Choose ledger…' }, ...(ledgers ?? []).map((l) => ({ value: String(l.id), label: `${l.name} (${l.group_name})` }))]

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate(
          {
            voucher_type: type,
            date,
            narration,
            lines: lines.filter((l) => l.ledger && (Number(l.debit) || Number(l.credit))).map((l) => ({ ledger: Number(l.ledger), debit: l.debit || '0', credit: l.credit || '0' })),
          },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Voucher type" options={VOUCHER_TYPES.filter((t) => t.manual)} value={type} onChange={(e) => setType(e.target.value as VoucherType)} />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} />
      </div>
      {HINTS[type] && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">{HINTS[type]}</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-stone-500">
          <tr>
            <th className="pb-1 font-medium">Ledger</th>
            <th className="w-32 pb-1 font-medium">Debit (₹)</th>
            <th className="w-32 pb-1 font-medium">Credit (₹)</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                <select aria-label={`Line ${i + 1} ledger`} value={l.ledger} onChange={(e) => update(i, { ledger: e.target.value })} className="w-full rounded-md border border-stone-300 px-2 py-1.5">
                  {ledgerOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-2">
                <input aria-label={`Line ${i + 1} debit`} type="number" step="0.01" min="0" value={l.debit} onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-right" />
              </td>
              <td className="py-1 pr-2">
                <input aria-label={`Line ${i + 1} credit`} type="number" step="0.01" min="0" value={l.credit} onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-right" />
              </td>
              <td>
                <button type="button" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, n) => n !== i))} aria-label={`Remove line ${i + 1}`} className="rounded p-1 text-stone-400 hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="size-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="pt-2">
              <button type="button" onClick={() => setLines([...lines, { ledger: '', debit: '', credit: '' }])} className="text-sm text-brand-700 hover:underline">
                + Add line
              </button>
            </td>
            <td className="pt-2 text-right">{(dr / 100).toFixed(2)}</td>
            <td className="pt-2 text-right">{(cr / 100).toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {!balanced && dr + cr > 0 && <p className="text-sm text-red-600">Debits and credits must be equal (difference ₹{(Math.abs(dr - cr) / 100).toFixed(2)}).</p>}
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!balanced} loading={create.isPending}>
          Save voucher
        </Button>
      </div>
    </form>
  )
}
