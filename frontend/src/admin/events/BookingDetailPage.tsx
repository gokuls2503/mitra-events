import { ArrowLeft, MessageCircle, Pencil, Phone, Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { daysUntil, fmtDate, fmtDateTime, fmtTime } from '@/shared/dates'
import { formatINR, prettyPhone, telLink, waLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'

import { crm, useBooking, useCrmMutation, type Booking, type BookingStatus } from '../crm/api'
import { BookingStatusPill } from '../crm/StatusPills'
import { FormError, QueryState } from '../kit'
import { LeadReferences } from '../crm/references/LeadReferences'
import { BillingSection } from './BillingSection'
import { BookingForm } from './BookingForm'
import { EventTasksSection } from './EventTasksSection'
import { TeamSection } from './TeamSection'

export default function BookingDetailPage() {
  const id = Number(useParams().id)
  const { data: booking, isLoading, error } = useBooking(id)
  if (isLoading || error || !booking) return <QueryState isLoading={isLoading} error={error} />
  return <BookingDetail booking={booking} />
}

function BookingDetail({ booking: b }: { booking: Booking }) {
  const { hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const save = useCrmMutation(crm.saveBooking)
  const days = daysUntil(b.event_date)
  const setStatus = (status: BookingStatus) => save.mutate({ id: b.id, status })

  return (
    <div>
      <Link to="/admin/events" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand-700 print:hidden">
        <ArrowLeft className="size-4" /> All events
      </Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-gold-600 uppercase">
            {b.number} · {b.event_type_label}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold text-brand-800">{b.title}</h1>
            <BookingStatusPill status={b.status} label={b.status_label} />
          </div>
          <p className="text-sm text-stone-600">
            {fmtDate(b.event_date)}
            {b.end_date && ` – ${fmtDate(b.end_date)}`}
            {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && (days >= 0 ? ` · ${days === 0 ? 'today' : `in ${days} day${days > 1 ? 's' : ''}`}` : ' · date has passed')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto print:hidden">
          <Button variant="secondary" onClick={() => window.print()} title="Printable sheet for the decor team">
            <Printer className="size-4" /> Event sheet
          </Button>
          {isManager && b.status === 'CONFIRMED' && days <= 1 && (
              <Button variant="secondary" loading={save.isPending} onClick={() => setStatus('IN_PROGRESS')}>
                Mark in progress
              </Button>
            )}
          {isManager && (b.status === 'IN_PROGRESS' || (b.status === 'CONFIRMED' && days < 0)) && (
            <Button loading={save.isPending} onClick={() => setStatus('COMPLETED')}>
              Mark completed
            </Button>
          )}
          {isManager && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </div>
      <FormError error={save.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] print:block">
        <div className="space-y-6">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Item label="Venue">
              {b.venue}
              {b.venue_address && <span className="block text-stone-600 whitespace-pre-line">{b.venue_address}</span>}
            </Item>
            <Item label="Timing">
              {b.start_time ? `Starts ${fmtTime(b.start_time)}` : 'Start time not set'}
              {b.setup_time && <span className="block text-stone-600">Decor team arrives by {fmtTime(b.setup_time)}</span>}
            </Item>
            <Item label="Guests">{b.guest_count ?? '—'}</Item>
            <Item label="Agreed amount" className="print:hidden">{b.agreed_amount ? `${formatINR(b.agreed_amount)} + GST` : '—'}</Item>
            <Item label="Coordinator">{b.coordinator_name ?? <span className="text-amber-700">Not yet assigned</span>}</Item>
            <Item label="Package">{b.package_name ?? '—'}</Item>
          </dl>
          {b.notes && <p className="mt-5 rounded-lg bg-stone-50 p-3 text-sm whitespace-pre-line text-stone-700">{b.notes}</p>}
          <p className="mt-5 text-xs text-stone-400 print:hidden">Created {fmtDateTime(b.created_at)}.</p>
        </section>
        <BillingSection booking={b} />
        <TeamSection booking={b} />
        <EventTasksSection booking={b} />
        </div>

        <aside className="space-y-4 print:mt-6">
          {b.lead_id && (
            <div className="space-y-4 print:hidden">
              <LeadReferences leadId={b.lead_id} eyebrow={b.title} canWrite={hasRole('OWNER', 'MANAGER', 'STAFF')} />
            </div>
          )}
          <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm print:break-inside-avoid">
            <h2 className="mb-2 font-sans text-xs font-semibold tracking-wide text-stone-500 uppercase">Client</h2>
            <Link to={`/admin/crm/clients/${b.client}`} className="text-base font-medium text-brand-800 hover:underline">
              {b.client_name}
            </Link>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={telLink(b.client_phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 hover:bg-stone-50">
                <Phone className="size-4" /> {prettyPhone(b.client_phone)}
              </a>
              <a
                href={waLink(b.client_phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1.5 text-white hover:bg-green-700"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </div>
            {b.lead_id && (
              <Link to={`/admin/crm/leads/${b.lead_id}`} className="mt-3 block text-xs text-brand-700 hover:underline">
                View original enquiry & timeline →
              </Link>
            )}
          </section>
          {isManager && b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && (
            <section className="rounded-xl border border-red-100 p-4 text-sm print:hidden">
              {cancelling ? (
                <div className="space-y-2">
                  <p>Cancel this booking? It stays on record as cancelled.</p>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={save.isPending} onClick={() => setStatus('CANCELLED')}>
                      Yes, cancel booking
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelling(false)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCancelling(true)} className="text-red-700 hover:underline">
                  Cancel booking…
                </button>
              )}
            </section>
          )}
          {b.status === 'CANCELLED' && isManager && (
            <Button variant="secondary" onClick={() => setStatus('CONFIRMED')} loading={save.isPending}>
              Restore as confirmed
            </Button>
          )}
        </aside>
      </div>

      <Modal wide open={editing} title="Edit booking" onClose={() => setEditing(false)}>
        {editing && <BookingForm booking={b} onDone={() => setEditing(false)} />}
      </Modal>
    </div>
  )
}

function Item({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-stone-900">{children}</dd>
    </div>
  )
}
