import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { formatINR } from '@/shared/format'
import { Spinner } from '@/shared/ui/Spinner'

import { estimatorQuery, fetchEstimate, type EstimateInput, type EventType } from '../api'
import { EnquiryForm } from './LazyEnquiryForm'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const STEP_LABEL = 'text-sm font-semibold tracking-wide text-brand-800 uppercase'

export function Estimator() {
  const { data: options, isLoading } = useQuery(estimatorQuery)
  const [eventType, setEventType] = useState<EventType | null>(null)
  const [width, setWidth] = useState(20)
  const [depth, setDepth] = useState(12)
  const [guests, setGuests] = useState(200)
  const [addonIds, setAddonIds] = useState<number[]>([])
  const [showForm, setShowForm] = useState(false)

  const event = options?.event_types.find((e) => e.event_type === eventType)
  const activeType = event?.event_type ?? options?.event_types[0]?.event_type ?? null
  const activeEvent = options?.event_types.find((e) => e.event_type === activeType)
  const area = width * depth
  const areaOk = !!activeEvent && area >= activeEvent.min_sqft && area <= activeEvent.max_sqft
  const needsGuests = !!options?.addons.some((a) => a.pricing === 'PER_GUEST' && addonIds.includes(a.id))
  const guestsOk = !needsGuests || guests >= 1

  const input: EstimateInput | null = useMemo(
    () =>
      activeType && areaOk && guestsOk
        ? { event_type: activeType, width_ft: width, depth_ft: depth, guests: needsGuests ? guests : 0, addons: [...addonIds].sort() }
        : null,
    [activeType, areaOk, guestsOk, width, depth, needsGuests, guests, addonIds],
  )
  const debouncedInput = useDebounced(input, 250)

  const estimate = useQuery({
    queryKey: ['public', 'estimate', debouncedInput],
    queryFn: () => fetchEstimate(debouncedInput!),
    enabled: !!debouncedInput,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

  if (isLoading || !options) {
    return (
      <div className="grid place-items-center py-20 text-brand-700">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (!options.event_types.length) {
    return <p className="text-center text-stone-600">The estimator is being set up. Please contact us for a quote.</p>
  }

  const toggleAddon = (id: number) =>
    setAddonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <fieldset>
          <legend className={STEP_LABEL}>1 · What are you celebrating?</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {options.event_types.map((e) => (
              <button
                key={e.event_type}
                type="button"
                aria-pressed={activeType === e.event_type}
                onClick={() => setEventType(e.event_type)}
                className={clsx(
                  'rounded-xl px-3 py-3 text-sm font-medium transition',
                  activeType === e.event_type
                    ? 'bg-brand-700 text-white shadow-lg'
                    : 'bg-white text-stone-700 ring-1 ring-brand-100 hover:ring-brand-300',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </fieldset>

        {activeEvent && (
          <fieldset>
            <legend className={STEP_LABEL}>2 · Stage size</legend>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm text-stone-600">
                Width (ft)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={width || ''}
                  onChange={(e) => setWidth(Math.max(0, Math.floor(Number(e.target.value))) || 0)}
                  className="mt-1 block w-24 rounded-lg border border-stone-300 px-3 py-2 text-center"
                />
              </label>
              <span className="pb-2 text-stone-400">×</span>
              <label className="text-sm text-stone-600">
                Depth (ft)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={depth || ''}
                  onChange={(e) => setDepth(Math.max(0, Math.floor(Number(e.target.value))) || 0)}
                  className="mt-1 block w-24 rounded-lg border border-stone-300 px-3 py-2 text-center"
                />
              </label>
              <span className="pb-2 font-semibold text-brand-800">= {area.toLocaleString('en-IN')} sq ft</span>
            </div>
            <p className={clsx('mt-1 text-xs', areaOk ? 'text-stone-500' : 'text-red-600')}>
              {areaOk ? '' : 'Stage area must be '}
              {activeEvent.min_sqft.toLocaleString('en-IN')}–{activeEvent.max_sqft.toLocaleString('en-IN')} sq ft
              {areaOk ? ' for this event' : '.'}
            </p>
          </fieldset>
        )}

        {options.addons.length > 0 && (
          <fieldset>
            <legend className={STEP_LABEL}>3 · Add-ons (optional)</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {options.addons.map((a) => {
                const on = addonIds.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleAddon(a.id)}
                    className={clsx(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition',
                      on ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-1 ring-brand-100 hover:ring-brand-300',
                    )}
                  >
                    <span
                      className={clsx(
                        'grid size-5 shrink-0 place-items-center rounded border',
                        on ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300',
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="flex-1">{a.name}</span>
                    <span className="text-xs text-stone-500">
                      {formatINR(a.price)}
                      {a.pricing === 'PER_GUEST' && '/guest'}
                    </span>
                  </button>
                )
              })}
            </div>
            {needsGuests && (
              <label className="mt-4 flex items-center gap-3 text-sm text-stone-600">
                Number of guests
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={guests || ''}
                  onChange={(e) => setGuests(Math.max(0, Math.floor(Number(e.target.value))) || 0)}
                  className="w-24 rounded-lg border border-stone-300 px-3 py-2 text-center"
                />
              </label>
            )}
          </fieldset>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gold-300">
          <p className="flex items-center gap-2 font-caps text-xs font-semibold tracking-[0.2em] text-gold-700 uppercase">
            <Sparkles className="size-4" /> Your estimate
          </p>
          <div className="mt-3 min-h-[3.5rem]" aria-live="polite">
            {!input ? (
              <p className="text-sm text-stone-500">{guestsOk ? 'Enter a stage size within the range to see your estimate.' : 'Enter the number of guests.'}</p>
            ) : estimate.data ? (
              <AnimatePresence mode="wait">
                <motion.p
                  key={estimate.data.low}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="font-display text-4xl font-semibold text-brand-800"
                >
                  <span className="block font-sans text-sm font-medium text-stone-500">Starting from</span>
                  {formatINR(estimate.data.low)}
                </motion.p>
              </AnimatePresence>
            ) : (
              <Spinner className="size-6 text-brand-700" />
            )}
          </div>
          {input && estimate.data && (
            <>
              <ul className="mt-4 space-y-1.5 border-t border-gold-200 pt-4 text-sm text-stone-600">
                {estimate.data.lines.map((l) => (
                  <li key={l.label} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="shrink-0 font-medium text-brand-800">{formatINR(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-stone-500">{estimate.data.note}</p>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 w-full rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Get my detailed quote
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {showForm && input && (
          <motion.div
            id="estimate-enquiry"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onAnimationStart={() => document.getElementById('estimate-enquiry')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100 lg:col-span-2"
          >
            <h3 className="mb-1 text-3xl font-semibold text-brand-800">Send this estimate to Mitra</h3>
            <p className="mb-5 text-sm text-stone-600">We'll call you to understand your venue and design ideas.</p>
            <EnquiryForm estimateInput={input} submitLabel="Request detailed quote" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
