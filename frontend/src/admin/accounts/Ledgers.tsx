import { ArrowLeft, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, todayISO } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { CheckboxField, SelectField, TextField } from '@/shared/ui/Field'
import { DateField } from '@/shared/ui/DateField'
import { Modal } from '@/shared/ui/Modal'
import { Spinner } from '@/shared/ui/Spinner'

import { DeleteButton, FormError, QueryState } from '../kit'
import { accounts, useAccountsMutation, useGroups, useLedgers, useLedgerStatement, type Ledger } from './api'
import { fyStartISO } from './format'
import { DrCrAmount, FileButton, Money } from './ui'

export function LedgersPage() {
  const { hasRole } = useAuth()
  const canWrite = hasRole('OWNER', 'ACCOUNTANT')
  const [search, setSearch] = useState('')
  const [showZero, setShowZero] = useState(false)
  const [editing, setEditing] = useState<Ledger | 'new' | null>(null)
  const { data: ledgers, isLoading, error } = useLedgers()
  const { data: groups } = useGroups()

  const grouped = useMemo(() => {
    const term = search.toLowerCase()
    const list = (ledgers ?? []).filter(
      (l) => (!term || l.name.toLowerCase().includes(term)) && (showZero || term || Number(l.balance?.amount ?? 0) !== 0 || l.is_system || (!l.client && !l.vendor)),
    )
    const map = new Map<string, Ledger[]>()
    for (const l of list) map.set(l.group_name, [...(map.get(l.group_name) ?? []), l])
    const order = (groups ?? []).map((g) => g.name)
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [ledgers, groups, search, showZero])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search ledgers</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ledgers…" className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" className="size-4 accent-brand-700" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
          Show settled client/vendor ledgers
        </label>
        {canWrite && (
          <Button className="ml-auto" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New ledger
          </Button>
        )}
      </div>
      <p className="mb-4 text-xs text-stone-500">Client and vendor ledgers are created automatically. Add bank accounts, expense heads or loans here.</p>
      <QueryState isLoading={isLoading} error={error} />
      <div className="space-y-4">
        {grouped.map(([group, rows]) => (
          <section key={group} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <h2 className="bg-stone-50 px-4 py-2 font-sans text-xs font-semibold tracking-wide text-stone-600 uppercase">{group}</h2>
            <ul className="divide-y divide-stone-100">
              {rows.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Link to={`/admin/accounts/ledgers/${l.id}`} className="flex-1 text-brand-800 hover:underline">
                    {l.name}
                    {!l.is_active && <span className="ml-2 text-xs text-stone-400">inactive</span>}
                  </Link>
                  <DrCrAmount value={l.balance} />
                  {canWrite && !l.client && !l.vendor && (
                    <button onClick={() => setEditing(l)} className="text-xs text-stone-500 hover:text-brand-700">
                      Edit
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Modal open={editing !== null} title={editing === 'new' ? 'New ledger' : 'Edit ledger'} onClose={() => setEditing(null)}>
        {editing !== null && <LedgerForm ledger={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function LedgerForm({ ledger, onDone }: { ledger?: Ledger; onDone: () => void }) {
  const { data: groups } = useGroups()
  const save = useAccountsMutation(accounts.saveLedger)
  const remove = useAccountsMutation(accounts.deleteLedger)
  const opening = Number(ledger?.opening_balance ?? 0)
  const [f, setF] = useState({
    name: ledger?.name ?? '',
    group: String(ledger?.group ?? ''),
    opening: opening ? String(Math.abs(opening)) : '',
    side: opening < 0 ? 'Cr' : 'Dr',
    bank_details: ledger?.bank_details ?? '',
    gstin: ledger?.gstin ?? '',
    is_active: ledger?.is_active ?? true,
  })
  const group = groups?.find((g) => String(g.id) === f.group)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const amount = Number(f.opening) || 0
        save.mutate(
          {
            id: ledger?.id,
            name: f.name,
            group: Number(f.group),
            opening_balance: (f.side === 'Cr' ? -amount : amount).toFixed(2),
            bank_details: f.bank_details,
            gstin: f.gstin,
            is_active: f.is_active,
          },
          { onSuccess: onDone },
        )
      }}
    >
      <TextField label="Name *" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <SelectField
        label="Group *"
        required
        disabled={ledger?.is_system}
        options={[{ value: '', label: 'Choose…' }, ...(groups ?? []).map((g) => ({ value: String(g.id), label: g.parent_name ? `${g.parent_name} › ${g.name}` : g.name }))]}
        value={f.group}
        onChange={(e) => setF({ ...f, group: e.target.value })}
      />
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <TextField
          label="Opening balance (₹)"
          type="number"
          step="0.01"
          min="0"
          hint="Balance on the day you start using this software."
          value={f.opening}
          onChange={(e) => setF({ ...f, opening: e.target.value })}
        />
        <SelectField label="Dr / Cr" options={[{ value: 'Dr', label: 'Dr' }, { value: 'Cr', label: 'Cr' }]} value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} />
      </div>
      {group?.name === 'Bank Accounts' && (
        <TextField label="Account no. / IFSC" value={f.bank_details} onChange={(e) => setF({ ...f, bank_details: e.target.value })} />
      )}
      <CheckboxField label="Active" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
      <FormError error={save.error ?? remove.error} />
      <div className="flex items-center justify-end gap-2">
        {ledger && !ledger.is_system && (
          <div className="mr-auto">
            <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(ledger.id, { onSuccess: onDone })} />
          </div>
        )}
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}

export function LedgerStatementPage() {
  const id = Number(useParams().id)
  const [from, setFrom] = useState(fyStartISO())
  const [to, setTo] = useState(todayISO())
  const { data, isLoading, error, isFetching } = useLedgerStatement(id, from, to)

  return (
    <div>
      <Link to="/admin/accounts/ledgers" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand-700">
        <ArrowLeft className="size-4" /> Ledgers
      </Link>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h2 className="font-display text-3xl font-semibold text-brand-800">{data?.ledger.name ?? 'Ledger'}</h2>
          <p className="text-sm text-stone-600">{data?.ledger.group}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:ml-auto">
          <DateField label="From" className="w-full sm:w-44" value={from} max={to || undefined} onChange={setFrom} />
          <DateField label="To" className="w-full sm:w-44" value={to} min={from || undefined} onChange={setTo} />
          <FileButton kind="xlsx" url={`/accounts/ledgers/${id}/statement/`} params={{ from, to, export: 'xlsx' }} label="Excel" />
          {isFetching && <Spinner className="mb-2 size-4 text-stone-400" />}
        </div>
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Particulars</th>
                <th className="px-4 py-2">Voucher</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <tr className="bg-stone-50/50 font-medium">
                <td className="px-4 py-2">{fmtDate(from)}</td>
                <td className="px-4 py-2" colSpan={4}>
                  Opening balance
                </td>
                <td className="px-4 py-2 text-right">
                  <DrCrAmount value={data.opening} />
                </td>
              </tr>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2">
                    {r.particulars}
                    {r.narration && <span className="block text-xs text-stone-500">{r.narration}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap">
                    {r.voucher_type}
                    <span className="block text-stone-500">{r.number}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{Number(r.debit) ? <Money value={r.debit} /> : ''}</td>
                  <td className="px-4 py-2 text-right">{Number(r.credit) ? <Money value={r.credit} /> : ''}</td>
                  <td className="px-4 py-2 text-right">
                    <DrCrAmount value={r.balance} />
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-stone-500">
                    No entries in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-stone-300 font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={3}>
                  Closing balance
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={data.total_debit} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={data.total_credit} />
                </td>
                <td className="px-4 py-2 text-right">
                  <DrCrAmount value={data.closing} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
