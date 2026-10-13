import clsx from 'clsx'
import { CalendarClock, Columns3, List, Plus, Search } from 'lucide-react'
import { useEffect, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { daysUntil, fmtDate, fmtShortDate, fromNow, isPast } from '@/shared/dates'
import { formatINR, prettyPhone } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Spinner } from '@/shared/ui/Spinner'

import { EmptyState, Pagination, QueryState, TABLE, TABLE_WRAP, THEAD } from '../kit'
import { crm, useCrmMutation, useLeads, usePipeline, useTeam, type Lead, type LeadStatus, type Params } from './api'
import { NewLeadDialog, StatusDialog } from './dialogs'
import { EVENT_TYPES, LEAD_SOURCES, LEAD_STATUS_ACCENT, LEAD_STATUSES } from './labels'
import { LeadStatusPill } from './StatusPills'

type View = 'board' | 'list'
const VIEW_KEY = 'mitra.crm.leadsView'
const PAGE_SIZE = 25

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'
  } catch {
    return 'board'
  }
}

export default function LeadsPage() {
  const { hasRole } = useAuth()
  const { data: team } = useTeam()
  const [view, setView] = useState<View>(readView)
  const [newOpen, setNewOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [owner, setOwner] = useState('')
  const [source, setSource] = useState('')
  const [eventType, setEventType] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const changeView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* private mode — fine */
    }
  }

  const filters: Params = {
    search: debounced,
    source,
    event_type: eventType,
    ...(owner === 'mine' ? { mine: true } : owner === 'none' ? { unassigned: true } : owner ? { assigned_to: owner } : {}),
  }
  const isManager = hasRole('OWNER', 'MANAGER')

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search leads</span>
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, venue…"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </label>
        {isManager && (
          <FilterSelect label="Owner" value={owner} onChange={setOwner}>
            <option value="">Everyone</option>
            <option value="mine">Mine</option>
            <option value="none">Unassigned</option>
            {team?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect label="Source" value={source} onChange={setSource}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Event" value={eventType} onChange={setEventType}>
          <option value="">All events</option>
          {EVENT_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </FilterSelect>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="View" className="flex rounded-lg border border-stone-300 bg-white p-0.5">
            {(
              [
                ['board', Columns3, 'Board'],
                ['list', List, 'List'],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => changeView(v)}
                className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm', view === v ? 'bg-brand-700 text-white' : 'text-stone-600')}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          {hasRole('OWNER', 'MANAGER', 'STAFF') && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New lead
            </Button>
          )}
        </div>
      </div>

      {view === 'board' ? <Board filters={filters} /> : <LeadList key={JSON.stringify(filters)} filters={filters} />}
      <NewLeadDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none"
      >
        {children}
      </select>
    </label>
  )
}

// --- Board ---------------------------------------------------------------------

function Board({ filters }: { filters: Params }) {
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading, error } = useLeads({ ...filters, board: true, page_size: 500, ordering: '-created_at' })
  const { data: pipeline } = usePipeline({ ...filters, board: true })
  const statusMutation = useCrmMutation(crm.changeStatus)
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null)
  const [pending, setPending] = useState<{ lead: Lead; target: LeadStatus } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const canMove = hasRole('OWNER', 'MANAGER', 'STAFF')

  if (isLoading || error) return <QueryState isLoading={isLoading} error={error} />
  const leads = data?.results ?? []

  function drop(e: DragEvent, target: LeadStatus) {
    e.preventDefault()
    setDragOver(null)
    const lead = leads.find((l) => String(l.id) === e.dataTransfer.getData('text/plain'))
    if (!lead || lead.status === target) return
    if (lead.booking) return setNotice(`${lead.name} already has a booking — change the booking instead.`)
    if (target === 'WON') {
      if (!hasRole('OWNER', 'MANAGER')) return setNotice('Ask the owner or a manager to confirm the booking.')
      return navigate(`/admin/crm/leads/${lead.id}?convert=1`)
    }
    if (target === 'LOST') return setPending({ lead, target })
    setNotice(null)
    statusMutation.mutate({ id: lead.id, status: target })
  }

  return (
    <>
      {(notice || statusMutation.error) && (
        <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice ?? 'Could not move the lead. Please try again.'}
        </p>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:px-0">
        <div className="grid min-w-max auto-cols-[16rem] grid-flow-col gap-3">
          {LEAD_STATUSES.map(({ value, label }) => {
            const column = leads.filter((l) => l.status === value)
            const stats = pipeline?.statuses.find((s) => s.status === value)
            return (
              <section
                key={value}
                aria-label={label}
                onDragOver={(e) => {
                  if (!canMove) return
                  e.preventDefault()
                  setDragOver(value)
                }}
                onDragLeave={() => setDragOver((d) => (d === value ? null : d))}
                onDrop={(e) => drop(e, value)}
                className={clsx(
                  'flex max-h-[calc(100vh-15rem)] flex-col rounded-xl border-t-4 bg-stone-100/80 transition',
                  LEAD_STATUS_ACCENT[value],
                  dragOver === value && 'bg-brand-50 ring-2 ring-brand-300',
                )}
              >
                <header className="flex items-baseline justify-between px-3 py-2">
                  <h2 className="font-sans text-sm font-semibold text-stone-800">{label}</h2>
                  <span className="text-xs text-stone-500">
                    {column.length}
                    {!!stats?.budget && ` · ${formatINR(stats.budget)}`}
                  </span>
                </header>
                <ul className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {column.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} draggable={canMove && !lead.booking} />
                  ))}
                  {column.length === 0 && <li className="px-2 py-6 text-center text-xs text-stone-400">No leads</li>}
                </ul>
                {(value === 'WON' || value === 'LOST') && <p className="px-3 pb-2 text-[11px] text-stone-400">Last 30 days</p>}
              </section>
            )
          })}
        </div>
      </div>
      {statusMutation.isPending && (
        <div className="fixed right-6 bottom-6 rounded-full bg-white p-2 shadow-lg">
          <Spinner />
        </div>
      )}
      {pending && <StatusDialog lead={pending.lead} target={pending.target} onClose={() => setPending(null)} />}
    </>
  )
}

function LeadCard({ lead, draggable }: { lead: Lead; draggable: boolean }) {
  const overdue = lead.next_follow_up && isPast(lead.next_follow_up)
  const initials = lead.assigned_to_detail?.full_name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(lead.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={clsx('rounded-lg bg-white shadow-xs ring-1 ring-stone-200 transition hover:ring-brand-300', draggable && 'cursor-grab active:cursor-grabbing')}
    >
      <Link to={`/admin/crm/leads/${lead.id}`} className="block p-3" draggable={false}>
        <div className="flex items-start justify-between gap-2">
          <p className="leading-tight font-medium text-stone-900">{lead.name}</p>
          {initials ? (
            <span title={lead.assigned_to_detail?.full_name} className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
              {initials}
            </span>
          ) : (
            <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800">Unassigned</span>
          )}
        </div>
        <p className="mt-1 text-xs text-stone-500">
          {[lead.event_type_label, lead.event_date && fmtShortDate(lead.event_date), lead.guest_count && `${lead.guest_count} guests`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {lead.budget && <span className="font-medium text-brand-700">{formatINR(lead.budget)}</span>}
          {lead.booking && <span className="text-green-700">{lead.booking.number}</span>}
          {lead.next_follow_up && (
            <span className={clsx('flex items-center gap-1', overdue ? 'font-medium text-red-600' : 'text-stone-500')}>
              <CalendarClock className="size-3" />
              {fromNow(lead.next_follow_up)}
            </span>
          )}
          <span className="ml-auto text-stone-400">{lead.source_label}</span>
        </div>
      </Link>
    </li>
  )
}

// --- List (remounted via `key` when filters change, which resets the page) ---------------------------------------------------------------------

function LeadList({ filters }: { filters: Params }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const { data, isLoading, error, isFetching } = useLeads({ ...filters, status, page, page_size: PAGE_SIZE, ordering: '-created_at' })

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {[{ value: '', label: 'All' }, ...LEAD_STATUSES].map((s) => (
          <button
            key={s.value}
            onClick={() => {
              setStatus(s.value)
              setPage(1)
            }}
            aria-pressed={status === s.value}
            className={clsx('rounded-full px-3 py-1 text-xs', status === s.value ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200')}
          >
            {s.label}
          </button>
        ))}
        {isFetching && <Spinner className="ml-2 size-4 text-stone-400" />}
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && <EmptyState>No leads match these filters.</EmptyState>}
      {data && data.results.length > 0 && (
        <>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Next follow-up</th>
                  <th className="px-4 py-3">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.results.map((l) => (
                  <tr key={l.id} className="hover:bg-brand-50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/crm/leads/${l.id}`} className="font-medium text-brand-800 hover:underline">
                        {l.name}
                      </Link>
                      <span className="block text-xs text-stone-500">{prettyPhone(l.phone)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <LeadStatusPill status={l.status} label={l.status_label} />
                    </td>
                    <td className="px-4 py-3">
                      {l.event_type_label || '—'}
                      {l.event_date && (
                        <span className={clsx('block text-xs', daysUntil(l.event_date) < 0 ? 'text-red-600' : 'text-stone-500')}>{fmtDate(l.event_date)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatINR(l.budget) || '—'}</td>
                    <td className="px-4 py-3">{l.assigned_to_detail?.full_name ?? <span className="text-amber-700">Unassigned</span>}</td>
                    <td className="px-4 py-3">
                      {l.next_follow_up ? (
                        <span className={clsx(isPast(l.next_follow_up) && 'font-medium text-red-600')}>{fromNow(l.next_follow_up)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {fromNow(l.created_at)}
                      <span className="block text-xs">{l.source_label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  )
}
