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
  setup_date: string
  setup_time: string
  venue: string
  venue_address: string
  agreed_amount: string
  coordinator: string
  coordinator_text: string
  coordinator_phone: string
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
          setup_date: booking.setup_date ?? '',
          setup_time: booking.setup_time?.slice(0, 5) ?? '',
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
        setup_date: v.setup_date || null,
        setup_time: v.setup_time || null,
        agreed_amount: v.agreed_amount || null,
        coordinator: v.coordinator ? Number(v.coordinator) : null,
      },
      {
        onSuccess: (saved) => (booking ? onDone() : navigate(`/admin/events/${saved.id}`)),
      },
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
      <TextField label="Handover time" hint="When the decor is handed over to the client" type="time" {...register('start_time')} />
      <TextField label="Coordinator" placeholder="Type the coordinator's name" {...register('coordinator_text')} />
      <TextField label="Coordinator number" type="tel" placeholder="98765 43210" {...register('coordinator_phone')} />
      <Controller
        control={control}
        name="setup_date"
        render={({ field }) => (
          <DateField label="Decoration date" hint="Leave blank if it's the event date" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
        )}
      />
      <TextField label="Decoration start time" type="time" {...register('setup_time')} />
      <TextField label="Venue *" required {...register('venue')} />
      <Controller
        control={control}
        name="coordinator"
        // Controlled, so the saved staff member stays selected even if the team list loads after the form.
        render={({ field }) => (
          <SelectField
            label="Assigned staff"
            hint="The app user who can open this event and gets its tasks"
            options={[
              { value: '', label: 'Not yet assigned' },
              ...(team ?? []).map((m) => ({
                value: String(m.id),
                label: m.full_name,
              })),
            ]}
            {...field}
          />
        )}
      />
      <TextAreaField label="Venue address" rows={2} {...register('venue_address')} />
      <TextField label="Amount (₹, before GST)" type="number" min={0} {...register('agreed_amount')} />
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
