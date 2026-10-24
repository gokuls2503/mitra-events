import { MessageCircle, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDateRange, todayISO } from '@/shared/dates'
import { formatINR, prettyPhone, telLink, waLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { useBookings } from '../crm/api'
import { FormError, QueryState } from '../kit'
import { ASSIGNMENT_STATUSES, ops, useAssignments, useOpsMutation, type Assignment, type Vendor } from './api'

/**
 * "Upcoming jobs" pop-up for one vendor: the jobs counted in the vendors table (the server
 * applies the same rule to both), plus a form to book the vendor for another event.
 */
export function UpcomingJobsDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  return (
    <Modal wide open={vendor !== null} title={vendor ? `Upcoming jobs — ${vendor.name}` : ''} onClose={onClose}>
      {vendor && <UpcomingJobs vendor={vendor} />}
    </Modal>
  )
}

function UpcomingJobs({ vendor }: { vendor: Vendor }) {
  const { hasRole } = useAuth()
  const canAdd = hasRole('OWNER', 'MANAGER') && vendor.is_active
  const [adding, setAdding] = useState(false)
  const { data, isLoading, error } = useAssignments({ vendor: vendor.id, upcoming: true })
  const jobs = [...(data ?? [])].sort((a, b) => a.booking_detail.event_date.localeCompare(b.booking_detail.event_date))
  const total = jobs.reduce((sum, j) => sum + Number(j.agreed_cost ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-stone-600">
          {vendor.category_label}
          {vendor.contact_person && ` · ${vendor.contact_person}`}
        </p>
        <a href={telLink(vendor.phone)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-50">
          <Phone className="size-4" /> {prettyPhone(vendor.phone)}
        </a>
        <a
          href={waLink(vendor.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700"
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      </div>

      <QueryState isLoading={isLoading} error={error} />
      {data && jobs.length === 0 && <p className="rounded-lg bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">No upcoming jobs for {vendor.name}.</p>}
      {jobs.length > 0 && (
        <div>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
          <p className="mt-2 flex justify-end gap-3 text-sm">
            <span className="text-stone-600">Total for upcoming jobs</span>
            <span className="font-semibold text-stone-900 tabular-nums">{formatINR(total)}</span>
          </p>
        </div>
      )}

      {canAdd &&
        (adding ? (
          <AddJobForm vendor={vendor} bookedOn={jobs.map((j) => j.booking)} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add job
          </Button>
        ))}
    </div>
  )
}

function JobRow({ job }: { job: Assignment }) {
  const b = job.booking_detail
  return (
    <li className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
      <span className="text-stone-600 tabular-nums">{fmtDateRange(b.event_date, b.end_date)}</span>
      <span className="min-w-0">
        <Link to={`/admin/events/${job.booking}`} className="font-medium text-brand-700 hover:underline">
          {b.title}
        </Link>
        <span className="block text-xs text-stone-500">
          {job.role}
          {b.venue && ` · ${b.venue}`}
        </span>
      </span>
      <span className="flex items-center gap-3 sm:justify-end">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{job.status_label}</span>
        <span className="font-medium tabular-nums">{job.agreed_cost ? formatINR(job.agreed_cost) : '—'}</span>
      </span>
    </li>
  )
}

interface JobValues {
  booking: string
  role: string
  report_time: string
  status: string
  agreed_cost: string
  notes: string
}

/** Books this vendor for an upcoming event (same fields as "+ Vendor" on an event page). */
function AddJobForm({ vendor, bookedOn, onDone }: { vendor: Vendor; bookedOn: number[]; onDone: () => void }) {
  // Events that haven't ended yet (multi-day events in progress included), soonest first.
  const { data: bookings, isLoading } = useBookings({ date_from: todayISO(), ordering: 'event_date', page_size: 200 })
  const save = useOpsMutation(ops.saveAssignment)
  const { register, handleSubmit } = useForm<JobValues>({
    defaultValues: { booking: '', role: vendor.category_label, report_time: '', status: 'PENDING', agreed_cost: '', notes: '' },
  })
  const events = (bookings?.results ?? []).filter((b) => b.status !== 'CANCELLED')
  const eventOptions = events.map((b) => ({
    value: String(b.id),
    label: `${fmtDateRange(b.event_date, b.end_date)} · ${b.title}${bookedOn.includes(b.id) ? ' (already booked)' : ''}`,
  }))

  return (
    <form
      className="grid gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2"
      onSubmit={handleSubmit((v) =>
        save.mutate(
          {
            booking: Number(v.booking),
            staff: null,
            vendor: vendor.id,
            role: v.role,
            report_time: v.report_time || null,
            status: v.status as Assignment['status'],
            agreed_cost: v.agreed_cost || null,
            notes: v.notes,
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <h3 className="text-sm font-semibold text-stone-800 sm:col-span-2">Add a job for {vendor.name}</h3>
      <SelectField
        label="Event *"
        required
        className="sm:col-span-2"
        options={[{ value: '', label: isLoading ? 'Loading events…' : events.length ? 'Choose an upcoming event…' : 'No upcoming events' }, ...eventOptions]}
        {...register('booking')}
      />
      <TextField label="Role / work *" required placeholder="e.g. Mandap flowers" {...register('role')} />
      <TextField label="Report at venue by" type="time" {...register('report_time')} />
      <SelectField label="Status" options={ASSIGNMENT_STATUSES.filter((s) => s.value !== 'CANCELLED')} {...register('status')} />
      <TextField label="Agreed cost (₹)" type="number" min={0} hint="What we pay them for this event." {...register('agreed_cost')} />
      <TextField label="Notes" className="sm:col-span-2" {...register('notes')} />
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Add job
          </Button>
        </div>
      </div>
    </form>
  )
}
