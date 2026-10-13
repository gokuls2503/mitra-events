import clsx from 'clsx'
import { AlertTriangle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { fmtDate, todayISO } from '@/shared/dates'
import { prettyPhone } from '@/shared/format'
import { TextField } from '@/shared/ui/Field'
import { Spinner } from '@/shared/ui/Spinner'

import { QueryState } from '../kit'
import { useReport, type DrCr } from './api'
import { fyStartISO } from './format'
import { DrCrAmount, FileButton, Money } from './ui'

const REPORTS = [
  { key: 'profit-loss', label: 'Profit & loss', range: true },
  { key: 'balance-sheet', label: 'Balance sheet', range: false },
  { key: 'trial-balance', label: 'Trial balance', range: false },
  { key: 'gst', label: 'GST summary', range: true },
  { key: 'receivables', label: 'Receivables', range: false },
  { key: 'payables', label: 'Payables', range: false },
] as const
type Key = (typeof REPORTS)[number]['key']

function monthStartISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ReportsPage() {
  const [report, setReport] = useState<Key>('profit-loss')
  const [from, setFrom] = useState(fyStartISO())
  const [to, setTo] = useState(todayISO())
  const [asOf, setAsOf] = useState(todayISO())
  const meta = REPORTS.find((r) => r.key === report)!
  const params: Record<string, string> = meta.range ? { from, to } : { as_of: asOf }
  const { data, isLoading, error, isFetching } = useReport<unknown>(report, params)

  return (
    <div>
      <div role="tablist" aria-label="Reports" className="mb-4 flex flex-wrap gap-1">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={report === r.key}
            onClick={() => {
              setReport(r.key)
              if (r.key === 'gst') setFrom(monthStartISO())
              else if (r.range) setFrom(fyStartISO())
            }}
            className={clsx('rounded-full px-3 py-1.5 text-sm', report === r.key ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200')}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {meta.range ? (
          <>
            <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ) : (
          <TextField label="As on" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        )}
        {isFetching && <Spinner className="mb-2 size-4 text-stone-400" />}
        <div className="ml-auto">
          <FileButton kind="xlsx" url={`/accounts/reports/${report}/`} params={{ ...params, export: 'xlsx' }} label="Excel" />
        </div>
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data != null && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          {report === 'profit-loss' && <ProfitLoss data={data as PL} />}
          {report === 'balance-sheet' && <BalanceSheet data={data as BS} />}
          {report === 'trial-balance' && <TrialBalance data={data as TB} />}
          {report === 'gst' && <Gst data={data as GST} />}
          {report === 'receivables' && <Receivables data={data as RCV} />}
          {report === 'payables' && <Payables data={data as PAY} />}
        </div>
      )}
    </div>
  )
}

// --- Shared bits -------------------------------------------------------------------------

type Row = { id?: number; name: string; amount: string }
type Group = { group: string; ledgers: Row[]; total: string }

function GroupBlock({ title, group, sign = '' }: { title?: string; group: Group; sign?: string }) {
  return (
    <div className="py-1">
      <div className="flex justify-between font-medium">
        <span>
          {sign}
          {title ?? group.group}
        </span>
        <Money value={group.total} />
      </div>
      {group.ledgers.map((l) => (
        <div key={l.name} className="flex justify-between pl-4 text-stone-600">
          {l.id ? (
            <Link to={`/admin/accounts/ledgers/${l.id}`} className="hover:underline">
              {l.name}
            </Link>
          ) : (
            <span>{l.name}</span>
          )}
          <Money value={l.amount} />
        </div>
      ))}
    </div>
  )
}

function Total({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={clsx('flex justify-between border-t border-stone-300 py-1.5 font-semibold', big && 'border-t-2 border-brand-700 text-base')}>
      <span>{label}</span>
      <Money value={value} />
    </div>
  )
}

function OpeningDiff({ diff }: { diff: DrCr | null }) {
  if (!diff) return null
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        Opening balances don't balance — difference <DrCrAmount value={diff} />. Check the opening balances on your ledgers (capital, bank, cash, debtors, creditors).
      </span>
    </p>
  )
}

// --- Reports -----------------------------------------------------------------------------

interface PL {
  sales: Group
  direct_expenses: Group
  gross_profit: string
  other_income: Group[]
  indirect_expenses: Group[]
  net_profit: string
}

function ProfitLoss({ data }: { data: PL }) {
  return (
    <div className="mx-auto max-w-xl text-sm">
      <GroupBlock title="Sales" group={data.sales} />
      <GroupBlock title="Direct expenses" group={data.direct_expenses} sign="Less: " />
      <Total label="Gross profit" value={data.gross_profit} />
      {data.other_income.map((g) => (
        <GroupBlock key={g.group} group={g} sign="Add: " />
      ))}
      {data.indirect_expenses.map((g) => (
        <GroupBlock key={g.group} group={g} sign="Less: " />
      ))}
      <Total label={Number(data.net_profit) >= 0 ? 'Net profit' : 'Net loss'} value={data.net_profit} big />
      <p className="mt-2 text-xs text-stone-500">Amounts exclude GST, which is collected for the government.</p>
    </div>
  )
}

interface BS {
  liabilities: Group[]
  profit_and_loss: string
  assets: Group[]
  total_liabilities: string
  total_assets: string
  opening_difference: DrCr | null
}

function BalanceSheet({ data }: { data: BS }) {
  return (
    <div className="text-sm">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-stone-500 uppercase">Liabilities</h3>
          {data.liabilities.map((g) => (
            <GroupBlock key={g.group} group={g} />
          ))}
          <div className="flex justify-between py-1 font-medium">
            <span>Profit & Loss A/c</span>
            <Money value={data.profit_and_loss} />
          </div>
          <Total label="Total" value={data.total_liabilities} big />
        </div>
        <div>
          <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-stone-500 uppercase">Assets</h3>
          {data.assets.map((g) => (
            <GroupBlock key={g.group} group={g} />
          ))}
          <Total label="Total" value={data.total_assets} big />
        </div>
      </div>
      <OpeningDiff diff={data.opening_difference} />
    </div>
  )
}

interface TB {
  groups: { group: string; ledgers: { id: number; name: string; debit: string; credit: string }[]; debit: string; credit: string }[]
  total_debit: string
  total_credit: string
  opening_difference: DrCr | null
}

function TrialBalance({ data }: { data: TB }) {
  return (
    <div className="overflow-x-auto text-sm">
      <table className="w-full min-w-[32rem]">
        <thead className="border-b border-stone-200 text-left text-xs text-stone-500 uppercase">
          <tr>
            <th className="py-2">Particulars</th>
            <th className="py-2 text-right">Debit</th>
            <th className="py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g) => [
            <tr key={g.group} className="font-medium">
              <td className="pt-3">{g.group}</td>
              <td className="pt-3 text-right">{Number(g.debit) ? <Money value={g.debit} /> : ''}</td>
              <td className="pt-3 text-right">{Number(g.credit) ? <Money value={g.credit} /> : ''}</td>
            </tr>,
            ...g.ledgers.map((l) => (
              <tr key={`${g.group}-${l.id}`} className="text-stone-600">
                <td className="pl-4">
                  <Link to={`/admin/accounts/ledgers/${l.id}`} className="hover:underline">
                    {l.name}
                  </Link>
                </td>
                <td className="text-right">{Number(l.debit) ? <Money value={l.debit} /> : ''}</td>
                <td className="text-right">{Number(l.credit) ? <Money value={l.credit} /> : ''}</td>
              </tr>
            )),
          ])}
        </tbody>
        <tfoot className="border-t-2 border-brand-700 font-semibold">
          <tr>
            <td className="py-2">Total</td>
            <td className="py-2 text-right">
              <Money value={data.total_debit} />
            </td>
            <td className="py-2 text-right">
              <Money value={data.total_credit} />
            </td>
          </tr>
        </tfoot>
      </table>
      <OpeningDiff diff={data.opening_difference} />
    </div>
  )
}

type TaxTotals = { taxable: string; cgst: string; sgst: string; igst: string }
interface GST {
  outward: { id: number; number: string; date: string; party: string; gstin: string; type: string; taxable: string; cgst: string; sgst: string; igst: string; total: string }[]
  outward_by_rate: { tax_rate: string; taxable: string; cgst: string; sgst: string; igst: string }[]
  outward_totals: TaxTotals
  inward: { id: number; number: string; date: string; party: string; gstin: string; bill_number: string; taxable: string; cgst: string; sgst: string; igst: string }[]
  inward_totals: TaxTotals
  net_payable: { cgst: string; sgst: string; igst: string }
  b2b_count: number
  b2c_count: number
}

function Gst({ data }: { data: GST }) {
  return (
    <div className="space-y-6 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {(['cgst', 'sgst', 'igst'] as const).map((k) => (
          <div key={k} className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs text-stone-500 uppercase">{k} payable</p>
            <p className="font-display text-2xl font-semibold">
              <Money value={data.net_payable[k]} />
            </p>
            <p className="text-xs text-stone-500">
              Output <Money value={data.outward_totals[k]} /> − input <Money value={data.inward_totals[k]} />
            </p>
          </div>
        ))}
      </div>
      <Section title={`Sales (${data.b2b_count} B2B, ${data.b2c_count} B2C)`}>
        <TaxTable
          rows={data.outward.map((r) => ({ key: r.id, cells: [fmtDate(r.date), <Link key="l" to={`/admin/accounts/invoices/${r.id}`} className="text-brand-700 hover:underline">{r.number}</Link>, r.party, r.gstin || <span key="t" className="text-stone-400">{r.type}</span>], tax: r }))}
          head={['Date', 'Invoice', 'Party', 'GSTIN']}
          totals={data.outward_totals}
        />
        {data.outward_by_rate.length > 0 && (
          <p className="mt-2 text-xs text-stone-500">
            By rate:{' '}
            {data.outward_by_rate.map((r) => (
              <span key={r.tax_rate} className="mr-3">
                {Number(r.tax_rate)}% on <Money value={r.taxable} />
              </span>
            ))}
          </p>
        )}
      </Section>
      <Section title="Purchases with GST (input tax credit)">
        <TaxTable
          rows={data.inward.map((r) => ({ key: r.id, cells: [fmtDate(r.date), r.bill_number || r.number, r.party, r.gstin || '—'], tax: r }))}
          head={['Date', 'Bill', 'Vendor', 'GSTIN']}
          totals={data.inward_totals}
        />
      </Section>
      <p className="text-xs text-stone-500">A working summary to help prepare GSTR-1 and GSTR-3B. Have your accountant verify before filing.</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</h3>
      {children}
    </section>
  )
}

function TaxTable({ head, rows, totals }: { head: string[]; rows: { key: number; cells: ReactNode[]; tax: TaxTotals }[]; totals: TaxTotals }) {
  if (!rows.length) return <p className="text-stone-500">None in this period.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem]">
        <thead className="border-b border-stone-200 text-left text-xs text-stone-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="py-1.5 font-medium">
                {h}
              </th>
            ))}
            {['Taxable', 'CGST', 'SGST', 'IGST'].map((h) => (
              <th key={h} className="py-1.5 text-right font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => (
                <td key={i} className="py-1.5 pr-2">
                  {c}
                </td>
              ))}
              {(['taxable', 'cgst', 'sgst', 'igst'] as const).map((k) => (
                <td key={k} className="py-1.5 text-right">
                  <Money value={r.tax[k]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-stone-300 font-semibold">
          <tr>
            <td className="py-1.5" colSpan={head.length}>
              Total
            </td>
            {(['taxable', 'cgst', 'sgst', 'igst'] as const).map((k) => (
              <td key={k} className="py-1.5 text-right">
                <Money value={totals[k]} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

interface RCV {
  clients: { client_id: number; client: string; phone: string; invoices: { id: number; number: string; due_date: string | null; due: string; days_overdue: number }[]; total: string; not_due: string; '0_30': string; '31_60': string; '61_90': string; '90_plus': string }[]
  totals: Record<'not_due' | '0_30' | '31_60' | '61_90' | '90_plus' | 'total', string>
  advances: { receipt_id: number; number: string; client: string; amount: string }[]
  advances_total: string
}

const AGE = [
  ['not_due', 'Not yet due'],
  ['0_30', '1–30 days'],
  ['31_60', '31–60'],
  ['61_90', '61–90'],
  ['90_plus', '90+'],
] as const

function Receivables({ data }: { data: RCV }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {AGE.map(([k, label]) => (
          <div key={k} className={clsx('rounded-lg p-2.5', k === '90_plus' || k === '61_90' ? 'bg-red-50' : 'bg-stone-50')}>
            <p className="text-xs text-stone-500">{label}</p>
            <p className="font-semibold">
              <Money value={data.totals[k]} />
            </p>
          </div>
        ))}
        <div className="rounded-lg bg-brand-700 p-2.5 text-white">
          <p className="text-xs text-brand-100">Total due</p>
          <p className="font-semibold">
            <Money value={data.totals.total} />
          </p>
        </div>
      </div>
      {data.clients.length === 0 && <p className="text-stone-500">Nothing outstanding. 🎉</p>}
      <ul className="divide-y divide-stone-100">
        {data.clients.map((c) => (
          <li key={c.client_id} className="py-2">
            <div className="flex flex-wrap justify-between gap-2">
              <Link to={`/admin/crm/clients/${c.client_id}`} className="font-medium text-brand-800 hover:underline">
                {c.client} <span className="font-normal text-stone-500">{prettyPhone(c.phone)}</span>
              </Link>
              <Money value={c.total} strong />
            </div>
            <ul className="mt-1 space-y-0.5 pl-4 text-xs text-stone-600">
              {c.invoices.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <Link to={`/admin/accounts/invoices/${i.id}`} className="hover:underline">
                    {i.number} · due {fmtDate(i.due_date)}
                    {i.days_overdue > 0 && <span className="text-red-600"> · {i.days_overdue} days overdue</span>}
                  </Link>
                  <Money value={i.due} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {data.advances.length > 0 && (
        <Section title={`Advances held (${data.advances.length})`}>
          <ul className="space-y-0.5 text-xs">
            {data.advances.map((a) => (
              <li key={a.receipt_id} className="flex justify-between">
                <span>
                  {a.client} · {a.number}
                </span>
                <Money value={a.amount} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

interface PAY {
  vendors: { ledger_id: number; vendor: string; phone: string; amount: string }[]
  total: string
}

function Payables({ data }: { data: PAY }) {
  return (
    <div className="text-sm">
      {data.vendors.length === 0 && <p className="text-stone-500">Nothing owed to vendors.</p>}
      <ul className="divide-y divide-stone-100">
        {data.vendors.map((v) => (
          <li key={v.ledger_id} className="flex justify-between py-2">
            <Link to={`/admin/accounts/ledgers/${v.ledger_id}`} className="hover:underline">
              {v.vendor}
            </Link>
            <Money value={v.amount} />
          </li>
        ))}
      </ul>
      {data.vendors.length > 0 && <Total label="Total owed" value={data.total} big />}
      <p className="mt-2 text-xs text-stone-500">Pay a vendor with a Payment voucher: Dr the vendor, Cr Cash/Bank.</p>
    </div>
  )
}
