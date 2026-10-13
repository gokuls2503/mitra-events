import { IndianRupee, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { Modal } from '@/shared/ui/Modal'

import { useBookingFinance } from '../accounts/api'
import { ExpenseForm } from '../accounts/Expenses'
import { DocStatus, Money } from '../accounts/ui'
import type { Booking } from '../crm/api'

/** Money for one event: quotations, invoices, received, spent and (for owner/accountant) margin. */
export function BillingSection({ booking }: { booking: Booking }) {
  const { hasRole } = useAuth()
  const visible = hasRole('OWNER', 'MANAGER', 'ACCOUNTANT')
  const accounts = hasRole('OWNER', 'ACCOUNTANT')
  const { data } = useBookingFinance(booking.id, visible)
  const [addingExpense, setAddingExpense] = useState(false)
  if (!visible || !data) return null

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 print:hidden">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <IndianRupee className="size-4 text-stone-400" />
        <h2 className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Billing</h2>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <Link to={`/admin/accounts/quotations/new?booking=${booking.id}`} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1 hover:bg-stone-50">
            <Plus className="size-3.5" /> Quotation
          </Link>
          {accounts && (
            <>
              <Link to={`/admin/accounts/invoices/new?booking=${booking.id}`} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1 hover:bg-stone-50">
                <Plus className="size-3.5" /> Invoice
              </Link>
              <button onClick={() => setAddingExpense(true)} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1 hover:bg-stone-50">
                <Plus className="size-3.5" /> Expense
              </button>
            </>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Invoiced" value={data.invoiced} />
        <Stat label="Received" value={data.received} />
        <Stat label="Balance due" value={data.balance_due} warn={Number(data.balance_due) > 0} />
        <Stat label="Spent" value={data.expenses} />
      </dl>
      {data.margin !== null && (
        <p className="mt-2 text-xs text-stone-500">
          Margin before GST: <Money value={data.margin} strong /> (invoiced value minus expenses booked to this event)
        </p>
      )}

      {(data.quotations.length > 0 || data.invoices.length > 0 || data.drafts.length > 0) && (
        <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100 text-sm">
          {data.quotations.map((q) => (
            <li key={`q${q.id}`} className="flex items-center gap-3 py-1.5">
              <Link to={`/admin/accounts/quotations/${q.id}`} className="text-brand-700 hover:underline">
                {q.number}
              </Link>
              <DocStatus kind="quotation" status={q.status} label={q.status_label} />
              <Money value={q.total} className="ml-auto" />
            </li>
          ))}
          {data.drafts.map((d) => (
            <li key={`d${d.id}`} className="flex items-center gap-3 py-1.5">
              <Link to={`/admin/accounts/invoices/${d.id}`} className="text-brand-700 hover:underline">
                Draft invoice
              </Link>
              <DocStatus kind="invoice" status="DRAFT" label="Draft" />
              <Money value={d.total} className="ml-auto" />
            </li>
          ))}
          {data.invoices.map((i) => (
            <li key={`i${i.id}`} className="flex items-center gap-3 py-1.5">
              <Link to={`/admin/accounts/invoices/${i.id}`} className="text-brand-700 hover:underline">
                {i.number}
              </Link>
              <DocStatus kind="invoice" status={i.status} label={i.status === 'ISSUED' ? 'Unpaid' : i.status_label} />
              <Money value={i.total} className="ml-auto" />
            </li>
          ))}
        </ul>
      )}
      <Modal wide open={addingExpense} title={`Expense for ${booking.title}`} onClose={() => setAddingExpense(false)}>
        {addingExpense && <ExpenseForm presetBooking={booking.id} onDone={() => setAddingExpense(false)} />}
      </Modal>
    </section>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={warn ? 'text-amber-800' : ''}>
        <Money value={value} strong />
      </dd>
    </div>
  )
}
