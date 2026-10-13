import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { daysUntil, fmtDate, fmtTime, fmtWeekday, parseDate, toISODate, todayISO } from '@/shared/dates'
import { formatINR } from '@/shared/format'
import { Spinner } from '@/shared/ui/Spinner'

import { useBookings, type Booking } from '../crm/api'
import { BOOKING_STATUSES } from '../crm/labels'
import { BookingStatusPill } from '../crm/StatusPills'
import { EmptyState, Pagination, QueryState } from '../kit'

type View = 'list' | 'calendar'
const PAGE_SIZE = 25

export default function EventsPage() {
  const { hasRole } = useAuth()
  const [view, setView] = useState<View>('list')
  const isStaff = hasRole('STAFF')

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-brand-800">{isStaff ? 'My events' : 'Events & bookings'}</h1>
          <p className="text-sm text-stone-600">
            {isStaff ? 'Events you are coordinating.' : 'Confirmed events. New bookings are created by converting a lead, or from a client page.'}
          </p>
        </div>
        <div role="group" aria-label="View" className="ml-auto flex rounded-lg border border-stone-300 bg-white p-0.5">
          {(
            [
              ['list', List, 'List'],
              ['calendar', CalendarDays, 'Calendar'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm', view === v ? 'bg-brand-700 text-white' : 'text-stone-600')}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'list' ? <EventList /> : <MonthCalendar />}
    </div>
  )
}

// --- List ----------------------------------------------------------------------------

function EventList() {
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, error, isFetching } = useBookings({
    upcoming: when === 'all' ? undefined : when === 'upcoming',
    status,
    search: debounced,
    ordering: when === 'past' ? '-event_date' : 'event_date',
    page,
    page_size: PAGE_SIZE,
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['upcoming', 'past', 'all'] as const).map((w) => (
          <button
            key={w}
            aria-pressed={when === w}
            onClick={() => {
              setWhen(w)
              setPage(1)
            }}
            className={clsx('rounded-full px-3 py-1.5 text-sm capitalize', when === w ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200')}
          >
            {w}
          </button>
        ))}
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm"
        >
          <option value="">Any status</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search events</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search booking no., client, venue…"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm"
          />
        </label>
        {isFetching && <Spinner className="size-4 text-stone-400" />}
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No events.</EmptyState>}
      <ul className="space-y-2">
        {data?.results.map((b) => (
          <li key={b.id}>
            <EventRow b={b} />
          </li>
        ))}
      </ul>
      {data && data.count > 0 && <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />}
    </div>
  )
}

function EventRow({ b }: { b: Booking }) {
  const days = daysUntil(b.event_date)
  const soon = b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && days >= 0 && days <= 7
  const date = parseDate(b.event_date)
  return (
    <Link
      to={`/admin/events/${b.id}`}
      className={clsx(
        'flex flex-wrap items-center gap-4 rounded-xl border bg-white p-3 transition hover:border-brand-300',
        soon ? 'border-amber-300' : 'border-stone-200',
        b.status === 'CANCELLED' && 'opacity-60',
      )}
    >
      <div className={clsx('w-14 shrink-0 rounded-lg py-1 text-center', soon ? 'bg-amber-100 text-amber-900' : 'bg-brand-50 text-brand-800')}>
        <p className="text-[10px] uppercase">{fmtWeekday(b.event_date)}</p>
        <p className="font-display text-2xl leading-none font-semibold">{date.getDate()}</p>
        <p className="text-[10px] uppercase">{date.toLocaleString('en-IN', { month: 'short' })}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-stone-900">
          {b.title} <BookingStatusPill status={b.status} label={b.status_label} />
        </p>
        <p className="text-sm text-stone-600">
          <MapPin className="mr-1 inline size-3.5" />
          {b.venue}
          {b.start_time && ` · ${fmtTime(b.start_time)}`}
          {b.end_date && ` · until ${fmtDate(b.end_date)}`}
        </p>
        <p className="text-xs text-stone-500">
          {b.number} · {b.client_name} · {b.coordinator_name ? `Coordinator: ${b.coordinator_name}` : <span className="text-amber-700">No coordinator</span>}
        </p>
      </div>
      <div className="text-right text-sm">
        {b.agreed_amount && <p className="font-medium">{formatINR(b.agreed_amount)}</p>}
        {soon && <p className="text-xs font-medium text-amber-700">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}</p>}
      </div>
    </Link>
  )
}

// --- Calendar ------------------------------------------------------------------------

function startOfThisMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthCalendar() {
  const [cursor, setCursor] = useState(startOfThisMonth)

  // Monday-first grid covering the whole month.
  const days = useMemo(() => {
    const start = new Date(cursor)
    start.setDate(1 - ((cursor.getDay() + 6) % 7))
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)))
    const out: Date[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d))
    return out
  }, [cursor])

  const from = toISODate(days[0])
  const to = toISODate(days[days.length - 1])
  const { data, isLoading, error } = useBookings({ date_from: from, date_to: to, page_size: 200, ordering: 'event_date' })
  const today = todayISO()

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of data?.results ?? []) {
      const start = parseDate(b.event_date)
      const end = b.end_date ? parseDate(b.end_date) : start
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toISODate(d)
        map.set(key, [...(map.get(key) ?? []), b])
      }
    }
    return map
  }, [data])

  const shift = (months: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1))

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg p-2 hover:bg-stone-100">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="min-w-44 text-center font-sans text-lg font-semibold">{cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={() => shift(1)} aria-label="Next month" className="rounded-lg p-2 hover:bg-stone-100">
          <ChevronRight className="size-5" />
        </button>
        <button
          onClick={() => setCursor(startOfThisMonth())}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Today
        </button>
        {isLoading && <Spinner className="size-4 text-stone-400" />}
      </div>
      <QueryState isLoading={false} error={error} />
      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7 overflow-hidden rounded-xl border border-stone-200 bg-stone-200 [gap:1px]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-stone-50 px-2 py-1.5 text-xs font-medium text-stone-500">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = toISODate(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const events = byDay.get(key) ?? []
            return (
              <div key={key} className={clsx('min-h-28 p-1.5', inMonth ? 'bg-white' : 'bg-stone-50')}>
                <p
                  className={clsx(
                    'mb-1 grid size-6 place-items-center rounded-full text-xs',
                    key === today ? 'bg-brand-700 font-semibold text-white' : inMonth ? 'text-stone-700' : 'text-stone-400',
                  )}
                >
                  {d.getDate()}
                </p>
                <ul className="space-y-1">
                  {events.slice(0, 3).map((b) => (
                    <li key={b.id}>
                      <Link
                        to={`/admin/events/${b.id}`}
                        title={`${b.title} — ${b.venue}`}
                        className={clsx(
                          'block truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                          b.status === 'CANCELLED'
                            ? 'bg-stone-100 text-stone-400 line-through'
                            : b.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-brand-100 text-brand-800 hover:bg-brand-200',
                        )}
                      >
                        {b.start_time && `${fmtTime(b.start_time)} `}
                        {b.title}
                      </Link>
                    </li>
                  ))}
                  {events.length > 3 && <li className="px-1 text-[11px] text-stone-500">+{events.length - 3} more</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
