import clsx from 'clsx'
import { MessageCircle, Phone, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate } from '@/shared/dates'
import { formatINR, prettyPhone, telLink, waLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { DeleteButton, EmptyState, FormError, Pagination, QueryState, TABLE, TABLE_WRAP, THEAD } from '../kit'
import { ops, useAssignments, useOpsMutation, useVendors, VENDOR_CATEGORIES, type Vendor } from './api'

const PAGE_SIZE = 25

export default function VendorsPage() {
  const { hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Vendor | 'new' | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, error } = useVendors({
    search: debounced,
    category,
    is_active: showInactive ? undefined : true,
    page,
    page_size: PAGE_SIZE,
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search vendors</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, contact, phone…"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm"
          />
        </label>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">All categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" className="size-4 accent-brand-700" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        {isManager && (
          <Button className="ml-auto" onClick={() => setOpen('new')}>
            <Plus className="size-4" /> Add vendor
          </Button>
        )}
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No vendors yet.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Upcoming jobs</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((v) => (
                  <tr key={v.id} className={clsx('hover:bg-brand-50', !v.is_active && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <button onClick={() => setOpen(v)} className="font-medium text-brand-800 hover:underline">
                        {v.name}
                      </button>
                      {!v.is_active && <span className="ml-2 text-xs text-stone-500">Inactive</span>}
                    </td>
                    <td className="px-4 py-3">{v.category_label}</td>
                    <td className="px-4 py-3">
                      {v.contact_person && <span className="block">{v.contact_person}</span>}
                      <span className="text-xs text-stone-500">{prettyPhone(v.phone)}</span>
                    </td>
                    <td className="px-4 py-3">{v.upcoming_jobs || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <a href={telLink(v.phone)} aria-label={`Call ${v.name}`} className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100">
                          <Phone className="size-4" />
                        </a>
                        <a
                          href={waLink(v.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`WhatsApp ${v.name}`}
                          className="rounded-lg p-1.5 text-green-700 hover:bg-green-50"
                        >
                          <MessageCircle className="size-4" />
                        </a>
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
      <Modal wide open={open !== null} title={open === 'new' ? 'Add vendor' : open ? open.name : ''} onClose={() => setOpen(null)}>
        {open !== null && (isManager ? <VendorForm vendor={open === 'new' ? undefined : open} onDone={() => setOpen(null)} /> : open !== 'new' && <VendorJobs vendor={open} />)}
      </Modal>
    </div>
  )
}

function VendorForm({ vendor, onDone }: { vendor?: Vendor; onDone: () => void }) {
  const save = useOpsMutation(ops.saveVendor)
  const remove = useOpsMutation(ops.deleteVendor)
  const { register, handleSubmit } = useForm<Partial<Vendor>>({
    defaultValues: vendor ?? { name: '', category: 'FLORIST', contact_person: '', phone: '', alt_phone: '', email: '', address: '', gstin: '', notes: '', is_active: true },
  })
  return (
    <div className="space-y-6">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate({ ...v, id: vendor?.id }, { onSuccess: onDone }))}>
        <TextField label="Business name *" required {...register('name')} />
        <SelectField label="Category" options={VENDOR_CATEGORIES} {...register('category')} />
        <TextField label="Contact person" {...register('contact_person')} />
        <TextField label="Mobile *" type="tel" required {...register('phone')} />
        <TextField label="Alternate phone" type="tel" {...register('alt_phone')} />
        <TextField label="Email" type="email" {...register('email')} />
        <TextAreaField label="Address" rows={2} {...register('address')} />
        <div className="space-y-4">
          <TextField label="GSTIN" maxLength={15} hint="Needed later for purchase bills with GST." {...register('gstin')} />
          <CheckboxField label="Active" hint="Inactive vendors can't be assigned to new events." {...register('is_active')} />
        </div>
        <TextAreaField label="Notes" rows={2} className="sm:col-span-2" placeholder="Rates, quality, reliability…" {...register('notes')} />
        <div className="space-y-3 sm:col-span-2">
          <FormError error={save.error ?? remove.error} />
          <div className="flex items-center justify-end gap-2">
            {vendor && (
              <div className="mr-auto">
                <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(vendor.id, { onSuccess: onDone })} />
              </div>
            )}
            <Button type="button" variant="secondary" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </div>
        </div>
      </form>
      {vendor && <VendorJobs vendor={vendor} />}
    </div>
  )
}

function VendorJobs({ vendor }: { vendor: Vendor }) {
  const { data } = useAssignments({ vendor: vendor.id })
  const jobs = [...(data ?? [])].sort((a, b) => b.booking_detail.event_date.localeCompare(a.booking_detail.event_date))
  return (
    <section className="border-t border-stone-100 pt-4">
      <h3 className="mb-2 text-sm font-semibold text-stone-800">Events with {vendor.name}</h3>
      {jobs.length === 0 && <p className="text-sm text-stone-500">No events yet.</p>}
      <ul className="space-y-1.5 text-sm">
        {jobs.map((a) => (
          <li key={a.id} className="flex flex-wrap gap-x-3">
            <span className="w-24 text-stone-500">{fmtDate(a.booking_detail.event_date)}</span>
            <Link to={`/admin/events/${a.booking}`} className="text-brand-700 hover:underline">
              {a.booking_detail.title}
            </Link>
            <span className="text-stone-500">{a.role}</span>
            {a.agreed_cost && <span className="ml-auto">{formatINR(a.agreed_cost)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
