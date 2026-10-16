import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { DateField } from '@/shared/ui/DateField'
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { MultiSelectField } from '@/shared/ui/MultiSelectField'

import { FormError } from '../kit'
import { crm, useCrmMutation, useTeam, type Lead, type LeadStatus } from './api'
import { EVENT_TYPES, LEAD_SOURCES, LEAD_STATUSES } from './labels'
import { MobileNumbers } from './MobileNumbers'

// --- Status change -------------------------------------------------------------

export function StatusDialog({ lead, target, onClose }: { lead: Lead; target: LeadStatus | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const mutation = useCrmMutation(crm.changeStatus)
  const label = LEAD_STATUSES.find((s) => s.value === target)?.label

  return (
    <Modal open={target !== null} title={`Move ${lead.name} to “${label}”`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (target) mutation.mutate({ id: lead.id, status: target, lost_reason: reason, note }, { onSuccess: onClose })
        }}
      >
        {target === 'LOST' && (
          <TextField
            label="Why was it lost? *"
            required
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Budget too low, chose another decorator, event cancelled"
          />
        )}
        <TextAreaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        {target === 'LOST' && <p className="text-xs text-stone-500">Pending follow-ups for this lead will be removed.</p>}
        <FormError error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} variant={target === 'LOST' ? 'danger' : 'primary'}>
            Move to {label}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// --- New lead -------------------------------------------------------------------

interface NewLeadValues {
  name: string
  email: string
  source: string
  event_types: Lead['event_types']
  event_date: string
  venue: string
  guest_count: string
  budget: string
  message: string
  assigned_to: string
}

export function NewLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal wide open={open} title="New lead" onClose={onClose}>
      <NewLeadForm onClose={onClose} />
    </Modal>
  )
}

function NewLeadForm({ onClose }: { onClose: () => void }) {
  const { user, hasRole } = useAuth()
  const navigate = useNavigate()
  const { data: team } = useTeam()
  const mutation = useCrmMutation(crm.createLead)
  const [mobiles, setMobiles] = useState([''])
  const { register, handleSubmit, control } = useForm<NewLeadValues>({
    defaultValues: { source: 'PHONE', event_types: [], assigned_to: hasRole('STAFF') ? String(user?.id) : '' },
  })

  const submit = (v: NewLeadValues) =>
    mutation.mutate(
      {
        ...v,
        phone: `+91${mobiles[0]}`,
        // Emptied extra boxes are simply dropped.
        extra_phones: mobiles.slice(1).filter(Boolean).map((d) => `+91${d}`),
        source: v.source as Lead['source'],
        event_date: v.event_date || null,
        guest_count: v.guest_count ? Number(v.guest_count) : null,
        budget: v.budget || null,
        assigned_to: v.assigned_to ? Number(v.assigned_to) : null,
      },
      { onSuccess: (lead) => navigate(`/admin/crm/leads/${lead.id}`) },
    )

  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
      <TextField label="Name *" required autoFocus {...register('name')} />
      <MobileNumbers values={mobiles} onChange={setMobiles} />
      <TextField label="Email" type="email" {...register('email')} />
      <SelectField label="How did they reach us?" options={LEAD_SOURCES} {...register('source')} />
      <Controller
        control={control}
        name="event_types"
        render={({ field }) => <MultiSelectField label="Event type" options={EVENT_TYPES} value={field.value} onChange={field.onChange} />}
      />
      <Controller
        control={control}
        name="event_date"
        render={({ field }) => <DateField label="Event date" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      />
      <TextField label="Venue / area" {...register('venue')} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Guests" type="number" min={1} {...register('guest_count')} />
        <TextField label="Budget (₹)" type="number" min={0} {...register('budget')} />
      </div>
      <TextAreaField label="Notes from the conversation" rows={3} className="sm:col-span-2" {...register('message')} />
      {hasRole('OWNER', 'MANAGER') && (
        <SelectField
          label="Assign to"
          options={[{ value: '', label: 'Unassigned' }, ...(team ?? []).map((m) => ({ value: String(m.id), label: m.full_name }))]}
          {...register('assigned_to')}
        />
      )}
      <div className="space-y-3 sm:col-span-2">
        <FormError error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create lead
          </Button>
        </div>
      </div>
    </form>
  )
}

// --- Convert to booking ----------------------------------------------------------

interface ConvertValues {
  title: string
  event_types: Lead['event_types']
  event_date: string
  end_date: string
  start_time: string
  setup_time: string
  venue: string
  venue_address: string
  guest_count: string
  agreed_amount: string
  coordinator: string
  notes: string
  client_name: string
  client_email: string
  client_address: string
  client_gstin: string
}

export function ConvertDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  return (
    <Modal wide open={open} title={`Confirm booking for ${lead.name}`} onClose={onClose}>
      <ConvertForm lead={lead} onClose={onClose} />
    </Modal>
  )
}

function ConvertForm({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: team } = useTeam()
  const mutation = useCrmMutation(crm.convert)
  // Everything filled in on Edit enquiry carries over, so nothing is typed twice.
  const coordinator = lead.coordinator ?? lead.assigned_to
  const { register, handleSubmit, control } = useForm<ConvertValues>({
    defaultValues: {
      title: `${lead.name} — ${lead.event_type_label || 'Event'}`,
      event_types: lead.event_types.length ? lead.event_types : lead.event_type ? [lead.event_type] : [],
      event_date: lead.event_date ?? '',
      end_date: lead.end_date ?? '',
      start_time: lead.start_time?.slice(0, 5) ?? '',
      setup_time: lead.setup_time?.slice(0, 5) ?? '',
      venue: lead.venue,
      venue_address: lead.venue_address,
      guest_count: lead.guest_count ? String(lead.guest_count) : '',
      agreed_amount: lead.budget ?? '',
      coordinator: coordinator ? String(coordinator) : '',
      notes: lead.message,
      client_name: lead.name,
      client_email: lead.email,
    },
  })

  const submit = (v: ConvertValues) =>
    mutation.mutate(
      {
        id: lead.id,
        ...v,
        end_date: v.end_date || null,
        start_time: v.start_time || null,
        setup_time: v.setup_time || null,
        guest_count: v.guest_count ? Number(v.guest_count) : null,
        agreed_amount: v.agreed_amount || null,
        coordinator: v.coordinator ? Number(v.coordinator) : null,
        package: lead.package,
      },
      { onSuccess: (booking) => navigate(`/admin/events/${booking.id}`) },
    )

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-stone-800">Event</legend>
        <TextField label="Booking title *" required className="sm:col-span-2" {...register('title')} />
        <Controller
          control={control}
          name="event_types"
          render={({ field }) => <MultiSelectField label="Event type *" options={EVENT_TYPES} value={field.value} onChange={field.onChange} />}
        />
        <TextField label="Agreed amount (₹, before GST)" type="number" min={0} {...register('agreed_amount')} />
        <Controller
          control={control}
          name="event_date"
          render={({ field }) => <DateField label="Event date *" required value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
        />
        <Controller
          control={control}
          name="end_date"
          render={({ field }) => <DateField label="End date (multi-day events)" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
        />
        <TextField label="Event start time" type="time" {...register('start_time')} />
        <TextField label="Decor team arrives by" type="time" {...register('setup_time')} />
        <TextField label="Venue *" required {...register('venue')} />
        <TextField label="Guests" type="number" min={1} {...register('guest_count')} />
        <TextAreaField label="Venue address" rows={2} {...register('venue_address')} />
        <SelectField
          label="Event coordinator"
          options={[{ value: '', label: 'Not yet assigned' }, ...(team ?? []).map((m) => ({ value: String(m.id), label: m.full_name }))]}
          {...register('coordinator')}
        />
        <TextAreaField label="Notes" rows={2} className="sm:col-span-2" {...register('notes')} />
      </fieldset>
      <fieldset className="grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-stone-800">
          Client {lead.client ? <span className="font-normal text-stone-500">(existing — {lead.client_name})</span> : <span className="font-normal text-stone-500">(new, from {lead.phone})</span>}
        </legend>
        <TextField label="Client name" {...register('client_name')} />
        <TextField label="Client email" type="email" {...register('client_email')} />
        <TextAreaField label="Billing address" rows={2} {...register('client_address')} />
        <TextField label="GSTIN (business clients)" maxLength={15} {...register('client_gstin')} />
      </fieldset>
      <FormError error={mutation.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Confirm booking
        </Button>
      </div>
    </form>
  )
}
