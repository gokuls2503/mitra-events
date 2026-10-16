import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/ui/Button'
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { DateField } from '@/shared/ui/DateField'
import { MultiSelectField } from '@/shared/ui/MultiSelectField'

import { crm, useCrmMutation, useTeam, type Booking } from '../crm/api'
import { BOOKING_STATUSES, EVENT_TYPES } from '../crm/labels'
import { FormError } from '../kit'

interface Values {
  title: string
  event_types: Booking['event_types']
  status: string
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
}

/** Create (pass clientId) or edit (pass booking) a booking. */
export function BookingForm({ booking, clientId, onDone }: { booking?: Booking; clientId?: number; onDone: () => void }) {
  const navigate = useNavigate()
  const { data: team } = useTeam()
  const save = useCrmMutation(crm.saveBooking)
  const { register, handleSubmit, control } = useForm<Values>({
    defaultValues: booking
      ? {
          ...booking,
          end_date: booking.end_date ?? '',
          start_time: booking.start_time?.slice(0, 5) ?? '',
          setup_time: booking.setup_time?.slice(0, 5) ?? '',
          guest_count: booking.guest_count ? String(booking.guest_count) : '',
          agreed_amount: booking.agreed_amount ?? '',
          coordinator: booking.coordinator ? String(booking.coordinator) : '',
          event_types: booking.event_types.length ? booking.event_types : [booking.event_type],
        }
      : { event_types: [], status: 'CONFIRMED' },
  })

  const submit = (v: Values) =>
    save.mutate(
      {
        id: booking?.id,
        ...(clientId ? { client: clientId } : {}),
        ...v,
        status: v.status as Booking['status'],
        end_date: v.end_date || null,
        start_time: v.start_time || null,
        setup_time: v.setup_time || null,
        guest_count: v.guest_count ? Number(v.guest_count) : null,
        agreed_amount: v.agreed_amount || null,
        coordinator: v.coordinator ? Number(v.coordinator) : null,
      },
      { onSuccess: (saved) => (booking ? onDone() : navigate(`/admin/events/${saved.id}`)) },
    )

  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
      <TextField label="Title *" required className="sm:col-span-2" {...register('title')} />
      <Controller
        control={control}
        name="event_types"
        render={({ field }) => <MultiSelectField label="Event type *" options={EVENT_TYPES} value={field.value} onChange={field.onChange} />}
      />
      {booking ? <SelectField label="Status" options={BOOKING_STATUSES} {...register('status')} /> : <span className="hidden sm:block" />}
      <Controller
        control={control}
        name="event_date"
        render={({ field }) => <DateField label="Event date *" required value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      />
      <Controller
        control={control}
        name="end_date"
        render={({ field }) => <DateField label="End date (multi-day)" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      />
      <TextField label="Event start time" type="time" {...register('start_time')} />
      <TextField label="Decor team arrives by" type="time" {...register('setup_time')} />
      <TextField label="Venue *" required {...register('venue')} />
      <TextField label="Guests" type="number" min={1} {...register('guest_count')} />
      <TextAreaField label="Venue address" rows={2} {...register('venue_address')} />
      <div className="space-y-4">
        <TextField label="Agreed amount (₹, before GST)" type="number" min={0} {...register('agreed_amount')} />
        <SelectField
          label="Coordinator"
          options={[{ value: '', label: 'Not yet assigned' }, ...(team ?? []).map((m) => ({ value: String(m.id), label: m.full_name }))]}
          {...register('coordinator')}
        />
      </div>
      <TextAreaField label="Notes" rows={3} className="sm:col-span-2" {...register('notes')} />
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {booking ? 'Save' : 'Create booking'}
          </Button>
        </div>
      </div>
    </form>
  )
}
