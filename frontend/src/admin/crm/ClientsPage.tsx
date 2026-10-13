import { Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { prettyPhone } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { EmptyState, FormError, Pagination, QueryState, TABLE, TABLE_WRAP, THEAD } from '../kit'
import { crm, useClients, useCrmMutation, type Client } from './api'

const PAGE_SIZE = 25

export default function ClientsPage() {
  const { hasRole } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, error } = useClients({ search: debounced, page, page_size: PAGE_SIZE })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search clients</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, GSTIN…"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </label>
        {hasRole('OWNER', 'MANAGER') && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add client
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-stone-500">Clients are created automatically when a lead is converted to a booking.</p>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No clients yet.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3">Bookings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((c) => (
                  <tr key={c.id} className="hover:bg-brand-50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/crm/clients/${c.id}`} className="font-medium text-brand-800 hover:underline">
                        {c.name}
                      </Link>
                      {c.gstin && <span className="block text-xs text-stone-500">GSTIN {c.gstin}</span>}
                    </td>
                    <td className="px-4 py-3">{prettyPhone(c.phone)}</td>
                    <td className="px-4 py-3">{c.city || '—'}</td>
                    <td className="px-4 py-3">{c.lead_count}</td>
                    <td className="px-4 py-3">{c.booking_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
      <Modal wide open={adding} title="Add client" onClose={() => setAdding(false)}>
        {adding && <ClientForm onDone={() => setAdding(false)} />}
      </Modal>
    </div>
  )
}

export function ClientForm({ client, onDone }: { client?: Client; onDone: () => void }) {
  const navigate = useNavigate()
  const save = useCrmMutation(crm.saveClient)
  const { register, handleSubmit } = useForm<Partial<Client>>({
    defaultValues: client ?? { name: '', phone: '', alt_phone: '', email: '', address: '', city: 'Coimbatore', gstin: '', notes: '' },
  })
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={handleSubmit((v) =>
        save.mutate(
          { ...v, id: client?.id },
          { onSuccess: (saved) => (client ? onDone() : navigate(`/admin/crm/clients/${saved.id}`)) },
        ),
      )}
    >
      <TextField label="Name *" required {...register('name')} />
      <TextField label="Mobile *" type="tel" required {...register('phone')} />
      <TextField label="Alternate phone" type="tel" {...register('alt_phone')} />
      <TextField label="Email" type="email" {...register('email')} />
      <TextAreaField label="Billing address" rows={2} {...register('address')} />
      <div className="space-y-4">
        <TextField label="City" {...register('city')} />
        <TextField label="GSTIN" maxLength={15} hint="Only for business clients." {...register('gstin')} />
      </div>
      <TextAreaField label="Notes" rows={2} className="sm:col-span-2" {...register('notes')} />
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
