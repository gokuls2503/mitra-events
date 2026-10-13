import clsx from 'clsx'
import { Download, FileText } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { prettyPhone } from '@/shared/format'
import { Button } from '@/shared/ui/Button'

import { useClients, type Client } from '../crm/api'
import type { InvoiceStatus, QuotationStatus } from './api'
import { openFile } from './api'

/** ₹1,23,456.78 — accounting screens show paise. */
export function Money({ value, className, strong }: { value: string | number | null | undefined; className?: string; strong?: boolean }) {
  if (value === null || value === undefined || value === '') return <span className={className}>—</span>
  const n = Number(value)
  const text = n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return <span className={clsx('tabular-nums', strong && 'font-semibold', n < 0 && 'text-red-700', className)}>{text}</span>
}

export function DrCrAmount({ value }: { value: { amount: string; side: 'Dr' | 'Cr' } | null }) {
  if (!value) return <span>—</span>
  if (Number(value.amount) === 0) return <span className="text-stone-400">0.00</span>
  return (
    <span className="tabular-nums">
      {Number(value.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span className="text-xs text-stone-500">{value.side}</span>
    </span>
  )
}

const INVOICE_STYLE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-stone-200 text-stone-700',
  ISSUED: 'bg-amber-100 text-amber-800',
  PARTIALLY_PAID: 'bg-sky-100 text-sky-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-stone-100 text-stone-400 line-through',
}
const QUOTATION_STYLE: Record<QuotationStatus, string> = {
  DRAFT: 'bg-stone-200 text-stone-700',
  SENT: 'bg-sky-100 text-sky-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-stone-100 text-stone-500',
  INVOICED: 'bg-violet-100 text-violet-800',
}

export function DocStatus({ status, label, kind }: { status: string; label: string; kind: 'invoice' | 'quotation' }) {
  const style = kind === 'invoice' ? INVOICE_STYLE[status as InvoiceStatus] : QUOTATION_STYLE[status as QuotationStatus]
  return <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', style)}>{label}</span>
}

export function FileButton({ url, label, params, kind = 'pdf' }: { url: string; label: string; params?: Record<string, string>; kind?: 'pdf' | 'xlsx' }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        setFailed(false)
        try {
          await openFile(url, params, kind)
        } catch {
          setFailed(true)
        } finally {
          setBusy(false)
        }
      }}
      title={failed ? 'Could not download. Try again.' : undefined}
      className={clsx(failed && 'ring-1 ring-red-300')}
    >
      {kind === 'pdf' ? <FileText className="size-4" /> : <Download className="size-4" />} {label}
    </Button>
  )
}

/** Search-as-you-type client picker. */
export function ClientPicker({
  value,
  label = 'Client *',
  onChange,
  disabled,
}: {
  value: Pick<Client, 'id' | 'name' | 'phone'> | null
  label?: string
  onChange: (client: Client | null) => void
  disabled?: boolean
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250)
    return () => clearTimeout(t)
  }, [text])
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const { data } = useClients({ search: debounced, page_size: 8 })

  if (value) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-stone-700">{label}</p>
        <div className="flex items-center gap-2 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
          <span className="flex-1">
            <strong>{value.name}</strong> <span className="text-stone-500">{prettyPhone(value.phone)}</span>
          </span>
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} className="text-xs text-brand-700 hover:underline">
              Change
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div ref={box} className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        placeholder="Search by name or phone…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {data?.results.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">No clients found. Add them under Leads & clients → Clients.</li>}
          {data?.results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
              >
                <strong>{c.name}</strong> <span className="text-stone-500">{prettyPhone(c.phone)}</span>
                {c.gstin && <span className="ml-2 text-xs text-stone-400">GSTIN {c.gstin}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
