import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { z } from 'zod'

import { apiErrorMessage } from '@/shared/api/client'
import { waLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'

import { EVENT_TYPE_LABELS, sendEnquiry, settingsQuery, type EstimateInput, type EventType } from '../api'

const eventTypeOptions = [
  { value: '', label: 'Select event type' },
  ...Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const schema = z.object({
  name: z.string().trim().min(2, 'Please enter your name'),
  phone: z
    .string()
    .trim()
    .refine((v) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(v.replace(/[\s\-()]/g, '')), 'Enter a valid 10-digit mobile number'),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  event_type: z.string(),
  event_date: z.string(),
  guest_count: z.string().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) > 0), 'Enter a number'),
  venue: z.string(),
  message: z.string().max(2000),
  website: z.string(), // honeypot
})
type Values = z.infer<typeof schema>

const noSubscribe = () => () => {}
const todayISO = () => new Date().toISOString().slice(0, 10)

interface Props {
  defaultEventType?: EventType | ''
  packageSlug?: string | null
  serviceSlug?: string | null
  estimateInput?: EstimateInput
  submitLabel?: string
}

export function EnquiryForm({ defaultEventType = '', packageSlug, serviceSlug, estimateInput, submitLabel = 'Send enquiry' }: Props) {
  const location = useLocation()
  const { data: site } = useQuery(settingsQuery)
  // Undefined while pre-rendering/hydrating (the HTML was built on another day), real date afterwards.
  const today = useSyncExternalStore(noSubscribe, todayISO, () => undefined)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      event_type: estimateInput?.event_type ?? defaultEventType,
      event_date: '',
      guest_count: estimateInput ? String(estimateInput.guests) : '',
      venue: '',
      message: '',
      website: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (v: Values) =>
      sendEnquiry({
        name: v.name,
        phone: v.phone,
        email: v.email,
        event_type: v.event_type as EventType | '',
        event_date: v.event_date || null,
        guest_count: v.guest_count ? Number(v.guest_count) : null,
        venue: v.venue,
        message: v.message,
        package: packageSlug || null,
        service: serviceSlug || null,
        source_page: location.pathname + location.search,
        estimate_input: estimateInput,
        website: v.website,
      }),
  })

  if (mutation.isSuccess) {
    return (
      <div role="status" className="rounded-2xl bg-brand-50 p-8 text-center ring-1 ring-brand-100">
        <CheckCircle2 className="mx-auto size-12 text-green-600" />
        <h3 className="mt-3 text-3xl font-semibold text-brand-800">Thank you!</h3>
        <p className="mt-2 text-stone-600">We've received your enquiry and will call you back shortly.</p>
        {site?.whatsapp && (
          <a
            href={waLink(site.whatsapp, 'Hi Mitra Events, I just sent an enquiry on your website.')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <MessageCircle className="size-4" /> Chat with us on WhatsApp
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
      <TextField label="Your name *" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField
        label="Mobile number *"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="98765 43210"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <SelectField label="Event type" options={eventTypeOptions} {...register('event_type')} />
      <TextField label="Event date" type="date" min={today} {...register('event_date')} />
      <TextField
        label="Approx. guests"
        type="number"
        inputMode="numeric"
        min={1}
        error={errors.guest_count?.message}
        {...register('guest_count')}
      />
      <TextField label="Venue / area" className="sm:col-span-2" placeholder="e.g. Hall name, RS Puram" {...register('venue')} />
      <div className="sm:col-span-2">
        <label htmlFor="enq-message" className="mb-1 block text-sm font-medium text-stone-700">
          Tell us about your event
        </label>
        <textarea
          id="enq-message"
          rows={4}
          className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          {...register('message')}
        />
      </div>
      {/* Honeypot: hidden from people, bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>
      {mutation.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {apiErrorMessage(mutation.error, 'Could not send your enquiry. Please call us instead.')}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={mutation.isPending} className="w-full rounded-full py-3 text-base sm:w-auto sm:px-8">
          {submitLabel}
        </Button>
        <p className="mt-2 text-xs text-stone-500">We'll only use your details to respond to this enquiry.</p>
      </div>
    </form>
  )
}
