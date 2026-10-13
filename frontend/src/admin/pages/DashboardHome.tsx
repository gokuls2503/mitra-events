import clsx from 'clsx'
import { AlertTriangle, CalendarClock, ClipboardList, Inbox, MapPin, Phone, UserX, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { daysUntil, fmtDate, fmtShortDate, fmtTime, fmtWeekday, fromNow, parseDate } from '@/shared/dates'
import { telLink } from '@/shared/format'

import { Money } from '../accounts/ui'
import { QueryState } from '../kit'
import { useDashboard, type DashboardEvent } from '../ops/api'
import { TaskItem } from '../ops/TaskItem'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardHome() {
  const { user, hasRole } = useAuth()
  const { data, isLoading, error } = useDashboard()
  if (!user) return null
  const isManager = hasRole('OWNER', 'MANAGER')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-800">
          {greeting()}, {user.full_name.split(' ')[0]}
        </h1>
        <p className="text-sm text-stone-600">{data ? fmtDate(data.today) : ''} · here's what needs you today.</p>
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && (
        <>
          {data.counts && (
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                to="/admin/crm/leads"
                icon={<Inbox />}
                label="New enquiries"
                value={data.counts.new_leads}
                note={isManager && data.counts.unassigned_leads ? `${data.counts.unassigned_leads} open leads unassigned` : undefined}
                tone={data.counts.new_leads ? 'brand' : 'neutral'}
              />
              <Stat
                to="/admin/crm/follow-ups"
                icon={<CalendarClock />}
                label={isManager ? 'Team follow-ups today' : 'Follow-ups due today'}
                value={data.counts.follow_ups_today}
                note={data.counts.follow_ups_overdue ? `${data.counts.follow_ups_overdue} overdue` : 'None overdue'}
                tone={data.counts.follow_ups_overdue ? 'danger' : 'neutral'}
              />
              <Stat
                to="/admin/operations/tasks"
                icon={<ClipboardList />}
                label="My tasks today"
                value={data.counts.tasks_today}
                note={data.counts.tasks_overdue ? `${data.counts.tasks_overdue} of mine overdue` : 'None overdue'}
                tone={data.counts.tasks_overdue ? 'danger' : 'neutral'}
              />
              <Stat
                to="/admin/events"
                icon={<Users />}
                label="Events this week"
                value={data.events.length}
                note={isManager && data.counts.team_tasks_overdue ? `${data.counts.team_tasks_overdue} team tasks overdue` : undefined}
                tone="neutral"
              />
            </div>
          )}

          {data.finance && (
            <section aria-label="Money" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MoneyTile to="/admin/accounts/invoices?filter=open" label="To collect" value={data.finance.receivable} note={data.finance.overdue_count ? `${data.finance.overdue_count} overdue (` : undefined} noteValue={data.finance.overdue_count ? data.finance.overdue_amount : undefined} danger={data.finance.overdue_count > 0} />
              <MoneyTile to="/admin/accounts/receipts" label="Collected this month" value={data.finance.collected_this_month} />
              <MoneyTile to="/admin/accounts/invoices" label="Invoiced this month" value={data.finance.invoiced_this_month} note={data.finance.draft_invoices ? `${data.finance.draft_invoices} draft invoice${data.finance.draft_invoices > 1 ? 's' : ''} not issued` : undefined} />
              <MoneyTile to="/admin/accounts/reports" label="GST payable (month so far)" value={data.finance.gst_payable_this_month} />
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
            <div className="space-y-6">
              <Panel title={hasRole('STAFF') ? 'My events this week' : 'Events this week'} action={<Link to="/admin/events" className="text-sm text-brand-700 hover:underline">All events</Link>}>
                {data.events.length === 0 ? (
                  <p className="text-sm text-stone-500">No events in the next 7 days.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.events.map((e) => (
                      <EventCard key={e.id} e={e} />
                    ))}
                  </ul>
                )}
              </Panel>

              {data.my_tasks && (
                <Panel title="My tasks" action={<Link to="/admin/operations/tasks" className="text-sm text-brand-700 hover:underline">All tasks</Link>}>
                  {data.my_tasks.length === 0 ? (
                    <p className="text-sm text-stone-500">Nothing due in the next 3 days.</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.my_tasks.map((t) => (
                        <TaskItem key={t.id} task={t} />
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
              {hasRole('ACCOUNTANT') && (
                <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                  Invoices, receipts and reports are under <Link to="/admin/accounts" className="text-brand-700 underline">Accounts & billing</Link>.
                </p>
              )}
            </div>

            <div className="space-y-6">
              {data.my_follow_ups && (
                <Panel title="My follow-ups due">
                  {data.my_follow_ups.length === 0 ? (
                    <p className="text-sm text-stone-500">All caught up.</p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {data.my_follow_ups.map((f) => {
                        const overdue = daysUntil(f.due_at.slice(0, 10)) < 0
                        return (
                          <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                            <div className="min-w-0 flex-1">
                              <Link to={`/admin/crm/leads/${f.lead}`} className="font-medium text-brand-800 hover:underline">
                                {f.lead_name}
                              </Link>
                              <p className={clsx('text-xs', overdue ? 'text-red-600' : 'text-stone-500')}>
                                {f.kind_label} · {fromNow(f.due_at)}
                                {f.notes && ` · ${f.notes}`}
                              </p>
                            </div>
                            <a href={telLink(f.lead_phone)} aria-label={`Call ${f.lead_name}`} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100">
                              <Phone className="size-4" />
                            </a>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Panel>
              )}

              {data.new_leads && (
                <Panel title="Waiting for a first call" action={<Link to="/admin/crm/leads" className="text-sm text-brand-700 hover:underline">Pipeline</Link>}>
                  {data.new_leads.length === 0 ? (
                    <p className="text-sm text-stone-500">No new enquiries.</p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {data.new_leads.map((l) => (
                        <li key={l.id} className="py-2 text-sm">
                          <Link to={`/admin/crm/leads/${l.id}`} className="font-medium text-brand-800 hover:underline">
                            {l.name}
                          </Link>
                          <p className="text-xs text-stone-500">
                            {[l.event_type_label, l.event_date && fmtShortDate(l.event_date), l.source_label].filter(Boolean).join(' · ')}
                          </p>
                          <p className={clsx('text-xs', daysUntil(l.created_at.slice(0, 10)) <= -1 ? 'text-red-600' : 'text-stone-500')}>
                            Received {fromNow(l.created_at)}
                            {!l.assigned_to_name && ' · unassigned'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              {data.attention && data.attention.events_without_coordinator.length > 0 && (
                <Panel title="Needs attention" icon={<AlertTriangle className="size-4 text-amber-600" />}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-stone-600">
                    <UserX className="size-3.5" /> Events in the next 30 days with no coordinator
                  </p>
                  <ul className="space-y-1 text-sm">
                    {data.attention.events_without_coordinator.map((e) => (
                      <li key={e.id}>
                        <Link to={`/admin/events/${e.id}`} className="text-brand-700 hover:underline">
                          {fmtShortDate(e.event_date)} · {e.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MoneyTile({ to, label, value, note, noteValue, danger }: { to: string; label: string; value: string; note?: string; noteValue?: string; danger?: boolean }) {
  return (
    <Link to={to} className={clsx('rounded-xl bg-white p-4 ring-1 transition hover:shadow-md', danger ? 'ring-red-200' : 'ring-stone-200')}>
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">
        <Money value={value} />
      </p>
      {note && (
        <p className={clsx('text-xs', danger ? 'text-red-600' : 'text-stone-500')}>
          {note}
          {noteValue && (
            <>
              <Money value={noteValue} />)
            </>
          )}
        </p>
      )}
    </Link>
  )
}

const TONES = {
  brand: 'bg-brand-700 text-white',
  danger: 'bg-white ring-1 ring-red-200',
  neutral: 'bg-white ring-1 ring-stone-200',
}

function Stat({ to, icon, label, value, note, tone }: { to: string; icon: ReactNode; label: string; value: number; note?: string; tone: keyof typeof TONES }) {
  return (
    <Link to={to} className={clsx('rounded-xl p-4 transition hover:shadow-md', TONES[tone])}>
      <div className={clsx('flex items-center gap-2 text-xs font-medium [&>svg]:size-4', tone === 'brand' ? 'text-brand-100' : 'text-stone-500')}>
        {icon}
        {label}
      </div>
      <p className="mt-1 font-display text-4xl font-semibold">{value}</p>
      {note && <p className={clsx('text-xs', tone === 'brand' ? 'text-brand-100' : tone === 'danger' ? 'text-red-600' : 'text-stone-500')}>{note}</p>}
    </Link>
  )
}

function Panel({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <header className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      {children}
    </section>
  )
}

function EventCard({ e }: { e: DashboardEvent }) {
  const days = daysUntil(e.event_date)
  const date = parseDate(e.event_date)
  const pct = e.tasks_total ? Math.round((e.tasks_done / e.tasks_total) * 100) : 0
  const when = days < 0 ? 'Ongoing' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
  return (
    <li>
      <Link to={`/admin/events/${e.id}`} className="flex gap-4 rounded-xl border border-stone-200 p-3 transition hover:border-brand-300">
        <div className={clsx('w-14 shrink-0 rounded-lg py-1 text-center', days <= 0 ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800')}>
          <p className="text-[10px] uppercase">{fmtWeekday(e.event_date)}</p>
          <p className="font-display text-2xl leading-none font-semibold">{date.getDate()}</p>
          <p className="text-[10px] uppercase">{date.toLocaleString('en-IN', { month: 'short' })}</p>
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-stone-900">{e.title}</span>
            <span className={clsx('text-xs font-medium', days <= 1 ? 'text-brand-700' : 'text-stone-500')}>{when}</span>
          </p>
          <p className="text-stone-600">
            <MapPin className="mr-1 inline size-3.5" />
            {e.venue}
            {e.setup_time && ` · setup ${fmtTime(e.setup_time)}`}
            {e.start_time && ` · starts ${fmtTime(e.start_time)}`}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-500">
            <span className={clsx(!e.coordinator_name && 'font-medium text-amber-700')}>{e.coordinator_name ?? 'No coordinator'}</span>
            <span>{e.staff_count} team</span>
            <span>
              {e.vendor_count} vendors
              {e.vendors_unconfirmed > 0 && <span className="font-medium text-amber-700"> ({e.vendors_unconfirmed} unconfirmed)</span>}
            </span>
          </p>
          {e.tasks_total > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                <div className={clsx('h-full rounded-full', pct === 100 ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-stone-500">
                {e.tasks_done}/{e.tasks_total} tasks
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-amber-700">No prep tasks yet</p>
          )}
        </div>
      </Link>
    </li>
  )
}
