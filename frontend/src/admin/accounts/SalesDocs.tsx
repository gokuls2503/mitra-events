import clsx from 'clsx'
import { ArrowLeft, CheckCircle2, Plus, Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { daysUntil, fmtDate } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'
import { FullPageSpinner } from '@/shared/ui/Spinner'

import { useBooking } from '../crm/api'
import { EmptyState, FormError, Pagination, QueryState, TABLE, TABLE_WRAP, THEAD } from '../kit'
import {
  accounts,
  INVOICE_STATUSES,
  useAccountsMutation,
  useInvoice,
  useInvoices,
  useQuotation,
  useQuotations,
  useSettings,
  useTaxRates,
  type Invoice,
  type Quotation,
} from './api'
import { DocumentEditor, type Prefill } from './DocumentEditor'
import { ReceiptForm } from './Receipts'
import { DocStatus, FileButton, Money } from './ui'

const PAGE_SIZE = 25

function useDebounced(value: string) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), 300)
    return () => clearTimeout(t)
  }, [value])
  return v
}

function ListHeader({ search, onSearch, children, newTo, newLabel, canCreate }: { search: string; onSearch: (s: string) => void; children?: ReactNode; newTo: string; newLabel: string; canCreate: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative min-w-48 flex-1 sm:max-w-xs">
        <span className="sr-only">Search</span>
        <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search number, client…" className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm" />
      </label>
      {children}
      {canCreate && (
        <Link to={newTo} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          <Plus className="size-4" /> {newLabel}
        </Link>
      )}
    </div>
  )
}

// --- Lists ----------------------------------------------------------------------------------

export function InvoicesPage() {
  const { hasRole } = useAuth()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const [filter, setFilter] = useState(params.get('filter') ?? '')
  const [page, setPage] = useState(1)
  const statusFilter = filter === 'open' ? { open: true } : filter === 'overdue' ? { overdue: true } : { status: filter }
  const { data, isLoading, error } = useInvoices({ ...statusFilter, search: debounced, page, page_size: PAGE_SIZE, ordering: '-invoice_date' })

  return (
    <div>
      <ListHeader search={search} onSearch={(s) => { setSearch(s); setPage(1) }} newTo="/admin/accounts/invoices/new" newLabel="New invoice" canCreate={hasRole('OWNER', 'ACCOUNTANT')}>
        <select aria-label="Status" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} className="rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm">
          <option value="">All invoices</option>
          <option value="open">Unpaid / partly paid</option>
          <option value="overdue">Overdue</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </ListHeader>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No invoices.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Balance due</th>
                  <th className="px-4 py-3">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((i) => {
                  const overdue = (i.status === 'ISSUED' || i.status === 'PARTIALLY_PAID') && i.due_date && daysUntil(i.due_date) < 0
                  return (
                    <tr key={i.id} className="hover:bg-brand-50">
                      <td className="px-4 py-3">
                        <Link to={`/admin/accounts/invoices/${i.id}`} className="font-medium text-brand-800 hover:underline">
                          {i.number ?? 'Draft'}
                        </Link>
                        <span className="block text-xs text-stone-500">{fmtDate(i.invoice_date)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {i.client_name}
                        {i.booking_title && <span className="block text-xs text-stone-500">{i.booking_title}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <DocStatus kind="invoice" status={i.status} label={i.status === 'ISSUED' ? 'Unpaid' : i.status_label} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Money value={i.total} />
                      </td>
                      <td className="px-4 py-3 text-right">{i.status === 'CANCELLED' || i.status === 'DRAFT' ? '—' : <Money value={i.balance_due} />}</td>
                      <td className={clsx('px-4 py-3', overdue && 'font-medium text-red-600')}>{i.due_date ? fmtDate(i.due_date) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  )
}

export function QuotationsPage() {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useQuotations({ status, search: debounced, page, page_size: PAGE_SIZE, ordering: '-date' })

  return (
    <div>
      <ListHeader search={search} onSearch={(s) => { setSearch(s); setPage(1) }} newTo="/admin/accounts/quotations/new" newLabel="New quotation" canCreate>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm">
          <option value="">All quotations</option>
          {['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'INVOICED'].map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </ListHeader>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No quotations.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Quotation</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Valid until</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((q) => (
                  <tr key={q.id} className="hover:bg-brand-50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/accounts/quotations/${q.id}`} className="font-medium text-brand-800 hover:underline">
                        {q.number}
                      </Link>
                      <span className="block text-xs text-stone-500">{fmtDate(q.date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {q.client_name}
                      {q.booking_title && <span className="block text-xs text-stone-500">{q.booking_title}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <DocStatus kind="quotation" status={q.status} label={q.status_label} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money value={q.total} />
                    </td>
                    <td className={clsx('px-4 py-3', q.valid_until && daysUntil(q.valid_until) < 0 && q.status === 'SENT' && 'text-red-600')}>{fmtDate(q.valid_until)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  )
}

// --- Editor pages ------------------------------------------------------------------------------

/** /accounts/{invoices|quotations}/new?booking=ID prefills client, event and one line from the booking. */
export function NewDocumentPage({ kind }: { kind: 'invoice' | 'quotation' }) {
  const [params] = useSearchParams()
  const bookingId = Number(params.get('booking')) || 0
  const { data: settings } = useSettings()
  const { data: taxRates } = useTaxRates()
  const booking = useBooking(bookingId)
  if (!settings || !taxRates || (bookingId && !booking.data)) return <FullPageSpinner />

  const b = booking.data
  const defaultTax = String(Number(taxRates.find((t) => t.id === settings.default_tax_rate)?.rate ?? 18))
  const prefill: Prefill | undefined = b
    ? {
        client: { id: b.client, name: b.client_name, phone: b.client_phone },
        booking: b.id,
        items: [
          {
            description: `${b.event_type_label} decoration — ${b.title} (${fmtDate(b.event_date)}, ${b.venue})`,
            sac: settings.default_sac,
            quantity: '1',
            unit: 'Nos',
            rate: b.agreed_amount ?? '',
            discount: '0',
            tax_rate: defaultTax,
          },
        ],
      }
    : undefined
  return (
    <div>
      <BackLink to={`/admin/accounts/${kind}s`} label={kind === 'invoice' ? 'Invoices' : 'Quotations'} />
      <h2 className="mb-4 text-2xl font-semibold text-brand-800">{kind === 'invoice' ? 'New invoice (draft)' : 'New quotation'}</h2>
      <DocumentEditor kind={kind} prefill={prefill} />
    </div>
  )
}

export function EditDocumentPage({ kind }: { kind: 'invoice' | 'quotation' }) {
  const id = Number(useParams().id)
  const { data: settings } = useSettings()
  const { data: taxRates } = useTaxRates()
  const invoice = useInvoice(kind === 'invoice' ? id : 0)
  const quotation = useQuotation(kind === 'quotation' ? id : 0)
  const doc = kind === 'invoice' ? invoice.data : quotation.data
  if (!settings || !taxRates || !doc) return <FullPageSpinner />
  return (
    <div>
      <BackLink to={`/admin/accounts/${kind}s/${id}`} label="Back" />
      <h2 className="mb-4 text-2xl font-semibold text-brand-800">Edit {kind === 'invoice' ? 'draft invoice' : `quotation ${doc.number}`}</h2>
      <DocumentEditor kind={kind} doc={doc} />
    </div>
  )
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand-700">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  )
}

// --- View pages --------------------------------------------------------------------------------

export function InvoiceViewPage() {
  const id = Number(useParams().id)
  const { data, isLoading, error } = useInvoice(id)
  if (!data) return <QueryState isLoading={isLoading} error={error} />
  return <InvoiceView inv={data} />
}

function InvoiceView({ inv }: { inv: Invoice }) {
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const canWrite = hasRole('OWNER', 'ACCOUNTANT')
  const issue = useAccountsMutation(accounts.issueInvoice)
  const remove = useAccountsMutation(accounts.deleteInvoice)
  const cancel = useAccountsMutation(accounts.cancelInvoice)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const open = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID'
  const liveAllocations = inv.allocations.filter((a) => !a.receipt_cancelled)

  return (
    <div>
      <BackLink to="/admin/accounts/invoices" label="Invoices" />
      <DocHeader
        title={inv.number ?? 'Draft invoice'}
        status={<DocStatus kind="invoice" status={inv.status} label={inv.status === 'ISSUED' ? 'Unpaid' : inv.status_label} />}
        subtitle={`${inv.client_name} · ${fmtDate(inv.invoice_date)}${inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}`}
      >
        <FileButton url={`/accounts/invoices/${inv.id}/pdf/`} label="PDF" />
        {canWrite && inv.status === 'DRAFT' && (
          <>
            <Link to={`/admin/accounts/invoices/${inv.id}/edit`} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm hover:bg-stone-50">
              Edit
            </Link>
            <Button loading={issue.isPending} onClick={() => issue.mutate(inv.id)}>
              <CheckCircle2 className="size-4" /> Issue invoice
            </Button>
          </>
        )}
        {canWrite && open && <Button onClick={() => setPaying(true)}>Record payment</Button>}
      </DocHeader>
      {inv.status === 'DRAFT' && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Draft — not yet a tax invoice. Issuing gives it the next invoice number, locks it, and posts it to the books.
        </p>
      )}
      {inv.status === 'CANCELLED' && <p className="mb-4 rounded-lg bg-stone-100 px-3 py-2 text-sm">Cancelled: {inv.cancel_reason}. The number stays used, as GST requires.</p>}
      <FormError error={issue.error ?? cancel.error ?? remove.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <DocBody doc={inv} />
        <aside className="space-y-4">
          <Panel title="Payment">
            <dl className="space-y-1 text-sm">
              <Line label="Total" value={<Money value={inv.total} />} />
              <Line label="Received" value={<Money value={inv.amount_paid} />} />
              <Line label={<strong>Balance due</strong>} value={<Money value={inv.status === 'CANCELLED' ? '0' : inv.balance_due} strong />} />
            </dl>
            {liveAllocations.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-600">
                {liveAllocations.map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <span>
                      {a.receipt_number} · {fmtDate(a.receipt_date)}
                    </span>
                    <Money value={a.amount} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {inv.booking && (
            <Panel title="Event">
              <Link to={`/admin/events/${inv.booking}`} className="text-sm text-brand-700 hover:underline">
                {inv.booking_number} · {inv.booking_title}
              </Link>
            </Panel>
          )}
          {inv.quotation_number && (
            <Panel title="From quotation">
              <Link to={`/admin/accounts/quotations/${inv.quotation}`} className="text-sm text-brand-700 hover:underline">
                {inv.quotation_number}
              </Link>
            </Panel>
          )}
          {canWrite && inv.status === 'DRAFT' && (
            <Button variant="ghost" className="text-red-600" loading={remove.isPending} onClick={() => remove.mutate(inv.id, { onSuccess: () => navigate('/admin/accounts/invoices') })}>
              Delete draft
            </Button>
          )}
          {canWrite && open && (
            <div className="rounded-xl border border-red-100 p-4 text-sm">
              {cancelling ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    cancel.mutate({ id: inv.id, reason }, { onSuccess: () => setCancelling(false) })
                  }}
                >
                  <label className="block">
                    Reason for cancelling *
                    <input required value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5" />
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" variant="danger" loading={cancel.isPending}>
                      Cancel invoice
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setCancelling(false)}>
                      Keep
                    </Button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setCancelling(true)} className="text-red-700 hover:underline">
                  Cancel invoice…
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      <Modal wide open={paying} title={`Record payment — ${inv.number}`} onClose={() => setPaying(false)}>
        {paying && <ReceiptForm presetClient={{ id: inv.client, name: inv.client_name, phone: '' }} presetInvoice={inv} presetBooking={inv.booking} onDone={() => setPaying(false)} />}
      </Modal>
    </div>
  )
}

export function QuotationViewPage() {
  const id = Number(useParams().id)
  const { data, isLoading, error } = useQuotation(id)
  if (!data) return <QueryState isLoading={isLoading} error={error} />
  return <QuotationView q={data} />
}

function QuotationView({ q }: { q: Quotation }) {
  const navigate = useNavigate()
  const setStatus = useAccountsMutation(accounts.quotationStatus)
  const convert = useAccountsMutation(accounts.convertQuotation)
  const remove = useAccountsMutation(accounts.deleteQuotation)
  const editable = q.status !== 'INVOICED'

  return (
    <div>
      <BackLink to="/admin/accounts/quotations" label="Quotations" />
      <DocHeader
        title={q.number}
        status={<DocStatus kind="quotation" status={q.status} label={q.status_label} />}
        subtitle={`${q.client_name} · ${fmtDate(q.date)}${q.valid_until ? ` · valid until ${fmtDate(q.valid_until)}` : ''}`}
      >
        <FileButton url={`/accounts/quotations/${q.id}/pdf/`} label="PDF" />
        {editable && (
          <Link to={`/admin/accounts/quotations/${q.id}/edit`} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm hover:bg-stone-50">
            Edit
          </Link>
        )}
        {q.status === 'DRAFT' && (
          <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate({ id: q.id, status: 'SENT' })}>
            Mark as sent
          </Button>
        )}
        {(q.status === 'SENT' || q.status === 'DRAFT') && (
          <Button variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate({ id: q.id, status: 'ACCEPTED' })}>
            Client accepted
          </Button>
        )}
        {editable && (
          <Button loading={convert.isPending} onClick={() => convert.mutate(q.id, { onSuccess: (inv) => navigate(`/admin/accounts/invoices/${inv.id}`) })}>
            Convert to invoice
          </Button>
        )}
      </DocHeader>
      <FormError error={setStatus.error ?? convert.error ?? remove.error} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <DocBody doc={q} />
        <aside className="space-y-4">
          {q.booking && (
            <Panel title="Event">
              <Link to={`/admin/events/${q.booking}`} className="text-sm text-brand-700 hover:underline">
                {q.booking_number} · {q.booking_title}
              </Link>
            </Panel>
          )}
          {(q.status === 'SENT' || q.status === 'ACCEPTED') && (
            <Button variant="ghost" className="text-stone-600" onClick={() => setStatus.mutate({ id: q.id, status: 'REJECTED' })}>
              Mark rejected
            </Button>
          )}
          {q.status === 'DRAFT' && (
            <Button variant="ghost" className="text-red-600" loading={remove.isPending} onClick={() => remove.mutate(q.id, { onSuccess: () => navigate('/admin/accounts/quotations') })}>
              Delete draft
            </Button>
          )}
        </aside>
      </div>
    </div>
  )
}

// --- Shared pieces -------------------------------------------------------------------------------

function DocHeader({ title, status, subtitle, children }: { title: string; status: ReactNode; subtitle: string; children: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl font-semibold text-brand-800">{title}</h2>
          {status}
        </div>
        <p className="text-sm text-stone-600">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:ml-auto">{children}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-600">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function DocBody({ doc }: { doc: Invoice | Quotation }) {
  const intra = Number(doc.igst_total) === 0
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-stone-500 uppercase">Bill to</p>
          <p className="font-medium">{'billing_name' in doc && doc.billing_name ? doc.billing_name : doc.client_name}</p>
          {'billing_address' in doc && doc.billing_address && <p className="whitespace-pre-line text-stone-600">{doc.billing_address}</p>}
          {(('billing_gstin' in doc && doc.billing_gstin) || doc.client_gstin) && <p className="text-stone-600">GSTIN {('billing_gstin' in doc && doc.billing_gstin) || doc.client_gstin}</p>}
        </div>
        <div>
          <p className="text-xs text-stone-500 uppercase">Place of supply</p>
          <p>
            {doc.place_of_supply} - {doc.place_of_supply_name} ({intra ? 'CGST + SGST' : 'IGST'})
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-stone-200 text-left text-xs text-stone-500">
            <tr>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">SAC</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Disc.</th>
              <th className="py-2 text-right font-medium">GST</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {doc.items.map((i, n) => (
              <tr key={n}>
                <td className="py-2 pr-2">{i.description}</td>
                <td className="py-2">{i.sac}</td>
                <td className="py-2 text-right">
                  {Number(i.quantity)} {i.unit}
                </td>
                <td className="py-2 text-right">
                  <Money value={i.rate} />
                </td>
                <td className="py-2 text-right">{Number(i.discount) ? <Money value={i.discount} /> : '—'}</td>
                <td className="py-2 text-right">{Number(i.tax_rate)}%</td>
                <td className="py-2 text-right">
                  <Money value={i.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <Line label="Taxable value" value={<Money value={doc.taxable_total} />} />
        {intra ? (
          <>
            <Line label="CGST" value={<Money value={doc.cgst_total} />} />
            <Line label="SGST" value={<Money value={doc.sgst_total} />} />
          </>
        ) : (
          <Line label="IGST" value={<Money value={doc.igst_total} />} />
        )}
        {Number(doc.round_off) !== 0 && <Line label="Round off" value={<Money value={doc.round_off} />} />}
        <div className="flex justify-between border-t-2 border-brand-700 pt-1.5 text-base font-semibold">
          <dt>Total</dt>
          <dd>
            <Money value={doc.total} />
          </dd>
        </div>
      </dl>
      {(doc.notes || doc.terms) && (
        <div className="mt-5 grid gap-4 border-t border-stone-100 pt-4 text-sm sm:grid-cols-2">
          {doc.notes && (
            <div>
              <p className="text-xs text-stone-500 uppercase">Notes</p>
              <p className="whitespace-pre-line">{doc.notes}</p>
            </div>
          )}
          {doc.terms && (
            <div>
              <p className="text-xs text-stone-500 uppercase">Terms</p>
              <p className="whitespace-pre-line text-stone-600">{doc.terms}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// Route-level wrappers.
export function NewInvoicePage() {
  return <NewDocumentPage kind="invoice" />
}
export function NewQuotationPage() {
  return <NewDocumentPage kind="quotation" />
}
export function EditInvoicePage() {
  return <EditDocumentPage kind="invoice" />
}
export function EditQuotationPage() {
  return <EditDocumentPage kind="quotation" />
}
