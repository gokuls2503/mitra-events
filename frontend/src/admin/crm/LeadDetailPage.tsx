import clsx from 'clsx'
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Sparkles,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDateRange, fmtDateTime, fromLocalInput, fromNow, toLocalInput, tomorrowAt } from '@/shared/dates'
import { formatINR, localDigits, prettyPhone, telLink, waLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { DateField } from '@/shared/ui/DateField'
import { Modal } from '@/shared/ui/Modal'
import { MultiSelectField } from '@/shared/ui/MultiSelectField'

import { DeleteButton, FormError, QueryState } from '../kit'
import { crm, useActivities, useCrmMutation, useFollowUps, useLead, useTeam, type ActivityKind, type FollowUp, type Lead, type LeadStatus } from './api'
import { ConvertDialog, StatusDialog } from './dialogs'
import { FollowUpRow } from './FollowUpRow'
import { MobileNumbers } from './MobileNumbers'
import { LeadReferences } from './references/LeadReferences'
import { EVENT_TYPES, FOLLOW_UP_KINDS, LEAD_STATUSES, OPEN_STATUSES } from './labels'
import { LeadStatusPill } from './StatusPills'

export default function LeadDetailPage() {
  const id = Number(useParams().id)
  const { data: lead, isLoading, error } = useLead(id)
  if (isLoading || error || !lead) return <QueryState isLoading={isLoading} error={error} />
  return <LeadDetail lead={lead} />
}

function LeadDetail({ lead }: { lead: Lead }) {
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [target, setTarget] = useState<LeadStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const convertOpen = params.get('convert') === '1'
  const setConvertOpen = (open: boolean) => setParams(open ? { convert: '1' } : {}, { replace: true })

  const canWork = hasRole('OWNER', 'MANAGER', 'STAFF')
  const isManager = hasRole('OWNER', 'MANAGER')
  const isOpen = OPEN_STATUSES.includes(lead.status)
  const remove = useCrmMutation(crm.deleteLead)

  return (
    <div>
      <Link to="/admin/crm/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand-700">
        <ArrowLeft className="size-4" /> All leads
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-3xl font-semibold text-brand-800">{lead.name}</h2>
            <LeadStatusPill status={lead.status} label={lead.status_label} />
            {lead.client && (
              <Link to={`/admin/crm/clients/${lead.client}`} className="rounded-full bg-gold-300/40 px-2 py-0.5 text-xs text-brand-900 hover:underline">
                Client: {lead.client_name}
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-600">
            {lead.source_label} · received {fromNow(lead.created_at)} ({fmtDateTime(lead.created_at)})
          </p>
          {lead.lost_reason && <p className="mt-1 text-sm text-stone-600">Lost: {lead.lost_reason}</p>}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <a href={telLink(lead.phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50">
            <Phone className="size-4" /> {prettyPhone(lead.phone)}
          </a>
          <a
            href={waLink(lead.phone, `Hi ${lead.name.split(' ')[0]}, this is Mitra Events regarding your enquiry.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
          {lead.booking ? (
            <Link to={`/admin/events/${lead.booking.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-800">
              <CalendarCheck className="size-4" /> Booking {lead.booking.number}
            </Link>
          ) : (
            isManager &&
            lead.status !== 'LOST' && (
              <Button onClick={() => setConvertOpen(true)}>
                <CalendarCheck className="size-4" /> Convert to booking
              </Button>
            )
          )}
        </div>
      </div>

      {/* Stage bar */}
      {canWork && !lead.booking && (
        <div className="mb-6 overflow-x-auto">
          <ol className="flex min-w-max gap-1" aria-label="Move to stage">
            {LEAD_STATUSES.filter((s) => s.value !== 'WON').map((s) => {
              const active = s.value === lead.status
              return (
                <li key={s.value}>
                  <button
                    disabled={active}
                    onClick={() => setTarget(s.value)}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition',
                      active ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-brand-400',
                      s.value === 'LOST' && !active && 'text-red-700',
                    )}
                  >
                    {s.value === 'LOST' && lead.status === 'LOST' ? 'Lost' : s.value === 'LOST' ? 'Mark lost' : s.label}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card
            title="Enquiry details"
            action={
              canWork && (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-sm text-brand-700 hover:underline">
                  <Pencil className="size-3.5" /> Edit
                </button>
              )
            }
          >
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Event">{lead.event_type_label || '—'}</Item>
              <Item label="Event date">{fmtDateRange(lead.event_date, lead.end_date)}</Item>
              <Item label="Venue">{lead.venue || '—'}</Item>
              <Item label="Guests">{lead.guest_count ?? '—'}</Item>
              <Item label="Budget">{formatINR(lead.budget) || '—'}</Item>
              <Item label="Phone">
                {/* Every number from Edit enquiry, comma-separated; each one starts a call. */}
                {[lead.phone, ...lead.extra_phones].map((p, i) => (
                  <span key={p}>
                    {i > 0 && ', '}
                    <a href={telLink(p)} className="whitespace-nowrap text-brand-700 tabular-nums hover:underline">
                      {prettyPhone(p)}
                    </a>
                  </span>
                ))}
              </Item>
              {(lead.package_name || lead.service_name) && <Item label="Interested in">{lead.package_name ?? lead.service_name}</Item>}
              {lead.source_page && <Item label="Website page">{lead.source_page}</Item>}
            </dl>
            {lead.message && <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm whitespace-pre-line text-stone-700">{lead.message}</p>}
          </Card>

          {lead.estimate && (
            <Card title="Website estimate" icon={<Sparkles className="size-4 text-gold-500" />}>
              <p className="font-display text-2xl font-semibold text-brand-800">
                {formatINR(lead.estimate.low)} – {formatINR(lead.estimate.high)}
              </p>
              <p className="text-xs text-stone-500">
                {lead.estimate.guests} guests · {lead.estimate.tier} decor
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {lead.estimate.lines.map((l) => (
                  <li key={l.label} className="flex justify-between gap-3">
                    <span className="text-stone-600">{l.label}</span>
                    <span>{formatINR(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Timeline lead={lead} canWrite={canWork} />
        </div>

        <aside className="space-y-6">
          <OwnerCard lead={lead} />
          <FollowUpsCard lead={lead} canWrite={canWork && isOpen} />
          <LeadReferences leadId={lead.id} eyebrow={[lead.name, lead.event_type_label].filter(Boolean).join(' · ')} canWrite={canWork} />
          {isManager && !lead.booking && (
            <div className="rounded-xl border border-red-100 p-4">
              <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(lead.id, { onSuccess: () => navigate('/admin/crm/leads') })} />
              <FormError error={remove.error} />
            </div>
          )}
        </aside>
      </div>

      {target && <StatusDialog lead={lead} target={target} onClose={() => setTarget(null)} />}
      <ConvertDialog lead={lead} open={convertOpen && isManager && !lead.booking} onClose={() => setConvertOpen(false)} />
      <Modal wide open={editing} title="Edit enquiry" onClose={() => setEditing(false)}>
        {editing && <EditLeadForm lead={lead} onDone={() => setEditing(false)} />}
      </Modal>
    </div>
  )
}

function Card({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <header className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">{title}</h3>
        <div className="ml-auto">{action}</div>
      </header>
      {children}
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-stone-900">{children}</dd>
    </div>
  )
}

// --- Owner -------------------------------------------------------------------

function OwnerCard({ lead }: { lead: Lead }) {
  const { hasRole } = useAuth()
  const { data: team } = useTeam()
  const assign = useCrmMutation(crm.assign)
  return (
    <Card title="Owner" icon={<Users className="size-4 text-stone-400" />}>
      {hasRole('OWNER', 'MANAGER') ? (
        <select
          aria-label="Assign lead to"
          value={lead.assigned_to ?? ''}
          disabled={assign.isPending}
          onChange={(e) => assign.mutate({ id: lead.id, assigned_to: e.target.value ? Number(e.target.value) : null })}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Unassigned</option>
          {team?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm">{lead.assigned_to_detail?.full_name ?? 'Unassigned'}</p>
      )}
      <FormError error={assign.error} />
    </Card>
  )
}

// --- Follow-ups -----------------------------------------------------------------

function FollowUpsCard({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const { data } = useFollowUps({ lead: lead.id, page_size: 50 })
  const [adding, setAdding] = useState(false)
  const items = data?.results ?? []
  const open = items.filter((f) => !f.completed_at)
  const done = items.filter((f) => f.completed_at)

  return (
    <Card
      title="Follow-ups"
      icon={<CalendarClock className="size-4 text-stone-400" />}
      action={
        canWrite && (
          <button onClick={() => setAdding(true)} className="text-sm text-brand-700 hover:underline">
            + Schedule
          </button>
        )
      }
    >
      {items.length === 0 && <p className="text-sm text-stone-500">None scheduled.</p>}
      <ul className="space-y-2">
        {open.map((f) => (
          <FollowUpRow key={f.id} fu={f} canWrite={canWrite} />
        ))}
      </ul>
      {done.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-stone-500">{done.length} completed</summary>
          <ul className="mt-2 space-y-2">
            {done.map((f) => (
              <li key={f.id} className="text-stone-500">
                <CheckCircle2 className="mr-1 inline size-3.5 text-green-600" />
                {f.kind_label} · {fmtDateTime(f.completed_at)}
                {f.outcome && <span className="block pl-5 text-xs">{f.outcome}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Modal open={adding} title="Schedule follow-up" onClose={() => setAdding(false)}>
        {adding && <FollowUpForm lead={lead} onDone={() => setAdding(false)} />}
      </Modal>
    </Card>
  )
}

function FollowUpForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const { hasRole } = useAuth()
  const { data: team } = useTeam()
  const create = useCrmMutation(crm.createFollowUp)
  const [defaultDate, defaultTime] = toLocalInput(tomorrowAt(10)).split('T')
  const { register, handleSubmit, control } = useForm({
    defaultValues: { due_date: defaultDate, due_time: defaultTime, kind: 'CALL', notes: '', assigned_to: String(lead.assigned_to ?? '') },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit((v) =>
        create.mutate(
          {
            lead: lead.id,
            due_at: fromLocalInput(`${v.due_date}T${v.due_time}`),
            kind: v.kind as FollowUp['kind'],
            notes: v.notes,
            assigned_to: v.assigned_to ? Number(v.assigned_to) : null,
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Controller
          control={control}
          name="due_date"
          render={({ field }) => <DateField label="Date *" required value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
        />
        <TextField label="Time *" type="time" required {...register('due_time')} />
        <SelectField label="Type" options={FOLLOW_UP_KINDS} {...register('kind')} />
      </div>
      <TextField label="What for?" placeholder="e.g. Share stage design options" {...register('notes')} />
      {hasRole('OWNER', 'MANAGER') && (
        <SelectField
          label="Who"
          options={[{ value: '', label: 'Lead owner' }, ...(team ?? []).map((m) => ({ value: String(m.id), label: m.full_name }))]}
          {...register('assigned_to')}
        />
      )}
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Schedule
        </Button>
      </div>
    </form>
  )
}

// --- Timeline ------------------------------------------------------------------

const MANUAL: { value: ActivityKind; label: string }[] = [
  { value: 'NOTE', label: 'Note' },
  { value: 'CALL', label: 'Call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'MEETING', label: 'Meeting' },
]

function Timeline({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const { data: activities } = useActivities(lead.id)
  const [kind, setKind] = useState<ActivityKind>('NOTE')
  const [text, setText] = useState('')
  const add = useCrmMutation(crm.addActivity)

  return (
    <Card title="Timeline" icon={<MessageSquare className="size-4 text-stone-400" />}>
      {canWrite && (
        <form
          className="mb-5 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate({ id: lead.id, kind, text }, { onSuccess: () => setText('') })
          }}
        >
          <div className="flex gap-1" role="radiogroup" aria-label="Entry type">
            {MANUAL.map((m) => (
              <button
                type="button"
                key={m.value}
                role="radio"
                aria-checked={kind === m.value}
                onClick={() => setKind(m.value)}
                className={clsx('rounded-full px-3 py-1 text-xs', kind === m.value ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-600')}
              >
                {m.label}
              </button>
            ))}
          </div>
          <TextAreaField
            label="Add to timeline"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'CALL' ? 'What did you discuss?' : 'Write a note…'}
          />
          <FormError error={add.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={!text.trim()} loading={add.isPending}>
              Add
            </Button>
          </div>
        </form>
      )}
      <ol className="relative space-y-4 border-l border-stone-200 pl-5">
        {activities?.map((a) => (
          <li key={a.id} className="relative">
            <span
              className={clsx(
                'absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-white',
                a.kind === 'CONVERTED' ? 'bg-green-500' : MANUAL.some((m) => m.value === a.kind) ? 'bg-brand-500' : 'bg-stone-300',
              )}
            />
            <p className="text-xs text-stone-500">
              <span className="font-medium text-stone-700">{a.kind_label}</span> · {a.created_by_name ?? 'Automatic'} · {fmtDateTime(a.created_at)}
            </p>
            {a.text && <p className="mt-0.5 text-sm whitespace-pre-line text-stone-800">{a.text}</p>}
          </li>
        ))}
      </ol>
    </Card>
  )
}

// --- Edit -------------------------------------------------------------------------

function EditLeadForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const update = useCrmMutation(crm.updateLead)
  const { data: team } = useTeam()
  const [mobiles, setMobiles] = useState(() => [lead.phone, ...lead.extra_phones].map(localDigits))
  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      name: lead.name,
      email: lead.email,
      event_types: lead.event_types.length ? lead.event_types : lead.event_type ? [lead.event_type] : [],
      budget: lead.budget ?? '',
      event_date: lead.event_date ?? '',
      end_date: lead.end_date ?? '',
      start_time: lead.start_time?.slice(0, 5) ?? '',
      setup_time: lead.setup_time?.slice(0, 5) ?? '',
      venue: lead.venue,
      guest_count: lead.guest_count ? String(lead.guest_count) : '',
      venue_address: lead.venue_address,
      coordinator: lead.coordinator ? String(lead.coordinator) : '',
      message: lead.message,
    },
  })
  const [first, ...rest] = mobiles

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={handleSubmit((v) =>
        update.mutate(
          {
            id: lead.id,
            ...v,
            phone: `+91${first}`,
            // Emptied extra boxes are simply dropped.
            extra_phones: rest.filter(Boolean).map((d) => `+91${d}`),
            event_date: v.event_date || null,
            end_date: v.end_date || null,
            start_time: v.start_time || null,
            setup_time: v.setup_time || null,
            guest_count: v.guest_count ? Number(v.guest_count) : null,
            budget: v.budget || null,
            coordinator: v.coordinator ? Number(v.coordinator) : null,
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <p className="text-sm font-semibold tracking-wider text-brand-800 uppercase sm:col-span-2">Enquiry</p>
      <TextField label="Name *" required className="self-start" {...register('name')} />
      <MobileNumbers values={mobiles} onChange={setMobiles} />
      <Controller
        control={control}
        name="event_types"
        render={({ field }) => <MultiSelectField label="Event type" options={EVENT_TYPES} value={field.value} onChange={field.onChange} />}
      />
      <TextField label="Budget (₹, before GST)" type="number" min={0} {...register('budget')} />
      <Controller
        control={control}
        name="event_date"
        render={({ field }) => <DateField label="Event date *" required value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      />
      <Controller
        control={control}
        name="end_date"
        render={({ field }) => <DateField label="End date" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      />
      <TextField label="Event start time" type="time" {...register('start_time')} />
      <TextField label="Decor team arrives by" type="time" {...register('setup_time')} />
      <TextField label="Venue" {...register('venue')} />
      <TextField label="Guests" type="number" min={1} {...register('guest_count')} />
      <TextAreaField label="Venue address" rows={2} className="sm:col-span-2" {...register('venue_address')} />
      <SelectField
        label="Event coordinator"
        options={[{ value: '', label: 'Not yet assigned' }, ...(team ?? []).map((m) => ({ value: String(m.id), label: m.full_name }))]}
        {...register('coordinator')}
      />
      <TextField label="Email" type="email" placeholder="client@email.com" {...register('email')} />
      <TextAreaField label="Notes" rows={3} className="sm:col-span-2" {...register('message')} />
      <div className="space-y-3 sm:col-span-2">
        <FormError error={update.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
