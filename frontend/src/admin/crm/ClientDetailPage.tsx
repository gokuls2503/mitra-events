import { ArrowLeft, CalendarPlus, Mail, MessageCircle, Pencil, Phone } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, fromNow } from '@/shared/dates'
import { formatINR, prettyPhone, telLink, waLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'

import { BookingForm } from '../events/BookingForm'
import { EmptyState, QueryState } from '../kit'
import { useBookings, useClient, useLeads } from './api'
import { ClientForm } from './ClientsPage'
import { BookingStatusPill, LeadStatusPill } from './StatusPills'

export default function ClientDetailPage() {
  const id = Number(useParams().id)
  const { hasRole } = useAuth()
  const { data: client, isLoading, error } = useClient(id)
  const { data: leads } = useLeads({ client: id, page_size: 100 })
  const { data: bookings } = useBookings({ client: id, page_size: 100, ordering: '-event_date' })
  const [editing, setEditing] = useState(false)
  const [booking, setBooking] = useState(false)

  if (isLoading || error || !client) return <QueryState isLoading={isLoading} error={error} />
  const isManager = hasRole('OWNER', 'MANAGER')
  const lifetime = bookings?.results.filter((b) => b.status !== 'CANCELLED').reduce((sum, b) => sum + Number(b.agreed_amount ?? 0), 0) ?? 0

  return (
    <div>
      <Link to="/admin/crm/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand-700">
        <ArrowLeft className="size-4" /> All clients
      </Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-brand-800">{client.name}</h2>
          <p className="text-sm text-stone-600">
            Client since {fmtDate(client.created_at)}
            {lifetime > 0 && ` · ${formatINR(lifetime)} booked`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <a href={telLink(client.phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50">
            <Phone className="size-4" /> {prettyPhone(client.phone)}
          </a>
          <a
            href={waLink(client.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
          {isManager && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button onClick={() => setBooking(true)}>
                <CalendarPlus className="size-4" /> New booking
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 text-sm">
          {client.email && (
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-stone-400" />
              <a href={`mailto:${client.email}`} className="break-all text-brand-700 hover:underline">
                {client.email}
              </a>
            </p>
          )}
          {client.alt_phone && <p>Alt. phone: {prettyPhone(client.alt_phone)}</p>}
          {client.address && <p className="whitespace-pre-line">{client.address}</p>}
          {client.city && <p>{client.city}</p>}
          {client.gstin && (
            <p>
              <span className="text-stone-500">GSTIN</span> {client.gstin}
            </p>
          )}
          {client.notes && <p className="rounded-lg bg-stone-50 p-2 whitespace-pre-line text-stone-700">{client.notes}</p>}
        </section>

        <div className="space-y-6">
          <section>
            <h3 className="mb-2 font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Bookings</h3>
            {bookings?.results.length === 0 && <EmptyState>No bookings yet.</EmptyState>}
            <ul className="space-y-2">
              {bookings?.results.map((b) => (
                <li key={b.id}>
                  <Link to={`/admin/events/${b.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm hover:border-brand-300">
                    <span className="font-medium text-brand-800">{b.title}</span>
                    <BookingStatusPill status={b.status} label={b.status_label} />
                    <span className="text-stone-500">
                      {b.number} · {fmtDate(b.event_date)} · {b.venue}
                    </span>
                    {b.agreed_amount && <span className="ml-auto font-medium">{formatINR(b.agreed_amount)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Enquiries</h3>
            {leads?.results.length === 0 && <EmptyState>No enquiries linked.</EmptyState>}
            <ul className="space-y-2">
              {leads?.results.map((l) => (
                <li key={l.id}>
                  <Link to={`/admin/crm/leads/${l.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm hover:border-brand-300">
                    <span className="font-medium">{l.event_type_label || 'Enquiry'}</span>
                    <LeadStatusPill status={l.status} label={l.status_label} />
                    <span className="text-stone-500">received {fromNow(l.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <Modal wide open={editing} title="Edit client" onClose={() => setEditing(false)}>
        {editing && <ClientForm client={client} onDone={() => setEditing(false)} />}
      </Modal>
      <Modal wide open={booking} title={`New booking for ${client.name}`} onClose={() => setBooking(false)}>
        {booking && <BookingForm clientId={client.id} onDone={() => setBooking(false)} />}
      </Modal>
    </div>
  )
}
