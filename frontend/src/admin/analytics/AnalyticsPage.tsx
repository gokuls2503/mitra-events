import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { DateField } from '@/shared/ui/DateField'
import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, toISODate } from '@/shared/dates'
import { Spinner } from '@/shared/ui/Spinner'

import { FileButton } from '../accounts/ui'
import { QueryState } from '../kit'
import { useOverview, type Compare, type Kpi, type Overview } from './api'
import { ChartCard, DataTable, TooltipBox } from './chartkit'
import { AXIS_TICK, compactINR, fullINR, INK, monthLabel, SERIES } from './chartTheme'

// --- Periods -------------------------------------------------------------------------

type Preset = 'month' | 'last_month' | 'quarter' | 'fy' | 'last_fy' | 'custom'

function fyStart(d: Date) {
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1)
}

function presetRange(p: Exclude<Preset, 'custom'>): [string, string] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (p) {
    case 'month':
      return [toISODate(new Date(y, m, 1)), toISODate(now)]
    case 'last_month':
      return [toISODate(new Date(y, m - 1, 1)), toISODate(new Date(y, m, 0))]
    case 'quarter': {
      // Indian FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar
      const qStartMonth = m - (((m - 3) % 3) + 3) % 3
      return [toISODate(new Date(y, qStartMonth, 1)), toISODate(now)]
    }
    case 'fy':
      return [toISODate(fyStart(now)), toISODate(now)]
    case 'last_fy': {
      const start = fyStart(now)
      return [toISODate(new Date(start.getFullYear() - 1, 3, 1)), toISODate(new Date(start.getFullYear(), 2, 31))]
    }
  }
}

const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'fy', label: 'This financial year' },
  { key: 'last_fy', label: 'Last financial year' },
]

// --- Page ---------------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { hasRole } = useAuth()
  const [preset, setPreset] = useState<Preset>('fy')
  const [[from, to], setRange] = useState(presetRange('fy'))
  const [compare, setCompare] = useState<Compare>('last_year')
  const { data, isLoading, error, isFetching, isPlaceholderData } = useOverview(from, to, compare)
  const showProfit = hasRole('OWNER', 'ACCOUNTANT')

  return (
    <div>
      <h1 className="text-3xl font-semibold text-brand-800">Business analytics</h1>
      <p className="mb-4 text-sm text-stone-600">
        {data ? `${fmtDate(data.date_from)} – ${fmtDate(data.date_to)}, compared with ${fmtDate(data.previous.date_from)} – ${fmtDate(data.previous.date_to)}` : ' '}
      </p>

      {/* One filter row scopes everything below it. */}
      <div className="mb-6 flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              aria-pressed={preset === p.key}
              onClick={() => {
                setPreset(p.key)
                setRange(presetRange(p.key))
              }}
              className={clsx('rounded-full px-3 py-1.5 text-sm', preset === p.key ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-brand-300')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <DateField compact label="From" className="w-40" value={from} max={to} onChange={(v) => { if (v) { setPreset('custom'); setRange([v, to]) } }} />
        <DateField compact label="To" className="w-40" value={to} min={from} onChange={(v) => { if (v) { setPreset('custom'); setRange([from, v]) } }} />
        <label className="text-xs text-stone-600">
          Compare with
          <select value={compare} onChange={(e) => setCompare(e.target.value as Compare)} className="mt-0.5 block rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option value="last_year">Same period last year</option>
            <option value="previous">Previous period</option>
          </select>
        </label>
        {isFetching && <Spinner className="mb-2 size-4 text-stone-400" />}
        <div className="ml-auto">
          <FileButton kind="xlsx" url="/analytics/overview/" params={{ from, to, compare, export: 'xlsx' }} label="Excel" />
        </div>
      </div>

      <QueryState isLoading={isLoading} error={error} />
      {data && (
        <div className={clsx('space-y-6 transition-opacity', isPlaceholderData && 'opacity-60')}>
          <KpiRow data={data} showProfit={showProfit} vsLabel={compare === 'last_year' ? 'vs last year' : 'vs previous'} />
          <div className="grid gap-6 xl:grid-cols-2">
            <MoneyChart data={data} showProfit={showProfit} />
            <BookingsChart data={data} />
            {data.leads && <PipelineChart data={data} />}
            {data.leads && <SourcesChart data={data} />}
            <EventTypesChart data={data} />
            <TopClients data={data} />
            {data.team && <TeamTable data={data} />}
            {data.leads && <LostReasons data={data} />}
          </div>
        </div>
      )}
    </div>
  )
}

// --- KPI tiles -------------------------------------------------------------------------------

function delta(k: Kpi, kind: 'pct' | 'points') {
  if (k.value === null || k.previous === null) return null
  if (kind === 'points') return Number(k.value) - Number(k.previous)
  if (!Number(k.previous)) return null
  return ((Number(k.value) - Number(k.previous)) / Math.abs(Number(k.previous))) * 100
}

function Tile({ label, kpi, format, vsLabel, upIsGood = true, deltaKind = 'pct', note }: { label: string; kpi?: Kpi; format: (v: number | null) => string; vsLabel: string; upIsGood?: boolean; deltaKind?: 'pct' | 'points'; note?: string }) {
  if (!kpi) return null
  const d = delta(kpi, deltaKind)
  const good = d === null || d === 0 ? null : d > 0 === upIsGood
  const Icon = d === null || d === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-900">{format(kpi.value)}</p>
      <p className={clsx('mt-0.5 flex items-center gap-0.5 text-xs', good === null ? 'text-stone-500' : good ? 'text-[#006300]' : 'text-red-700')}>
        <Icon className="size-3.5" aria-hidden />
        {d === null ? (Number(kpi.previous) ? 'no change' : 'no earlier data') : `${d > 0 ? '+' : ''}${d.toFixed(1)}${deltaKind === 'points' ? ' pts' : '%'} ${vsLabel}`}
      </p>
      {note && <p className="text-xs text-stone-500">{note}</p>}
    </div>
  )
}

function KpiRow({ data, showProfit, vsLabel }: { data: Overview; showProfit: boolean; vsLabel: string }) {
  const k = data.kpis
  const pct = (v: number | null) => (v === null ? '—' : `${Number(v).toFixed(1)}%`)
  const count = (v: number | null) => (v === null ? '—' : Number(v).toLocaleString('en-IN'))
  return (
    // auto-fit: 4–6 tiles (depending on role) always fill the row — no orphan tile.
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
      <Tile vsLabel={vsLabel} label="Revenue (excl. GST)" kpi={k.revenue} format={compactINR} />
      {showProfit && <Tile vsLabel={vsLabel} label="Profit" kpi={k.profit} format={compactINR} note={k.margin_pct?.value != null ? `${pct(k.margin_pct.value)} margin` : undefined} />}
      {showProfit && <Tile vsLabel={vsLabel} label="Expenses" kpi={k.expenses} format={compactINR} upIsGood={false} />}
      <Tile vsLabel={vsLabel} label="Collected" kpi={k.collected} format={compactINR} />
      <Tile vsLabel={vsLabel} label="Bookings" kpi={k.bookings} format={count} note={`${compactINR(k.booked_value.value)} booked · avg ${compactINR(k.average_booking.value)}`} />
      {k.conversion_pct && <Tile vsLabel={vsLabel} label="Lead conversion" kpi={k.conversion_pct} format={pct} deltaKind="points" note={`${k.leads.value} leads`} />}
    </section>
  )
}

// --- Charts ---------------------------------------------------------------------------------------

const spansYears = (d: Overview) => d.monthly.length > 0 && d.monthly[0].month.slice(0, 4) !== d.monthly[d.monthly.length - 1].month.slice(0, 4)

function MoneyChart({ data, showProfit }: { data: Overview; showProfit: boolean }) {
  const withYear = spansYears(data)
  const rows = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month, withYear) }))
  const legend = showProfit
    ? [
        { label: 'Revenue', color: SERIES.plum },
        { label: 'Expenses', color: SERIES.gold },
      ]
    : [{ label: 'Revenue', color: SERIES.plum }]
  return (
    <ChartCard
      title={showProfit ? 'Revenue and expenses by month' : 'Revenue by month'}
      subtitle="Excluding GST · from the accounts"
      legend={legend}
      table={
        <DataTable
          head={['Month', 'Revenue', ...(showProfit ? ['Expenses', 'Profit'] : []), 'Collected']}
          numeric={[1, 2, 3, 4]}
          rows={rows.map((r) => [monthLabel(r.month, true), fullINR(r.revenue), ...(showProfit ? [fullINR(r.expenses), fullINR(r.profit)] : []), fullINR(r.collected)])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.baseline }} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compactINR} width={56} />
            <Tooltip
              cursor={{ fill: '#8e3b7410' }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
                if (!active || !r) return null
                return (
                  <TooltipBox
                    title={monthLabel(r.month, true)}
                    rows={[
                      { label: 'revenue', value: fullINR(r.revenue), color: SERIES.plum },
                      ...(showProfit
                        ? [
                            { label: 'expenses', value: fullINR(r.expenses), color: SERIES.gold },
                            { label: 'profit', value: fullINR(r.profit) },
                          ]
                        : []),
                      { label: 'collected', value: fullINR(r.collected) },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="revenue" name="Revenue" fill={SERIES.plum} radius={[4, 4, 0, 0]} maxBarSize={24} />
            {showProfit && <Bar dataKey="expenses" name="Expenses" fill={SERIES.gold} radius={[4, 4, 0, 0]} maxBarSize={24} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

function BookingsChart({ data }: { data: Overview }) {
  const withYear = spansYears(data)
  const rows = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month, withYear) }))
  return (
    <ChartCard
      title="Bookings confirmed per month"
      subtitle={`${data.events_held} events held in this period${data.cancelled_bookings ? ` · ${data.cancelled_bookings} cancelled` : ''}`}
      table={<DataTable head={['Month', 'Bookings', 'Booked value']} numeric={[1, 2]} rows={rows.map((r) => [monthLabel(r.month, true), r.bookings, fullINR(r.booked_value)])} />}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.baseline }} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip
              cursor={{ fill: '#8e3b7410' }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
                if (!active || !r) return null
                return <TooltipBox title={monthLabel(r.month, true)} rows={[{ label: 'bookings', value: String(r.bookings) }, { label: 'booked value', value: fullINR(r.booked_value) }]} />
              }}
            />
            <Bar dataKey="bookings" fill={SERIES.plum} radius={[4, 4, 0, 0]} maxBarSize={24}>
              <LabelList dataKey="bookings" position="top" fill={INK.secondary} fontSize={12} formatter={(v: unknown) => (Number(v) ? String(v) : '')} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

/** Horizontal bars with the value written at the tip — for ranked categories. */
function HBar<T extends { label: string }>({
  rows,
  dataKey,
  tip,
  tooltip,
  format = (v) => String(v),
}: {
  rows: T[]
  dataKey: keyof T & string
  tip?: (r: T) => string
  tooltip: (r: T) => { label: string; value: string }[]
  format?: (v: number) => string
}) {
  const height = Math.max(rows.length * 36 + 16, 96)
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 96, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={INK.grid} />
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.baseline }} width={150} />
          <Tooltip
            cursor={{ fill: '#8e3b7410' }}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as T | undefined
              if (!active || !r) return null
              return <TooltipBox title={r.label} rows={tooltip(r)} />
            }}
          />
          <Bar dataKey={dataKey as string} fill={SERIES.plum} radius={[0, 4, 4, 0]} barSize={20}>
            <LabelList
              position="right"
              fill={INK.secondary}
              fontSize={12}
              content={(props) => {
                const { x = 0, y = 0, width = 0, height: h = 0, index = 0 } = props as { x?: number; y?: number; width?: number; height?: number; index?: number }
                const r = rows[index]
                return (
                  <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(h) / 2} dominantBaseline="central" fill={INK.secondary} fontSize={12}>
                    {tip ? tip(r) : format(Number(r[dataKey]))}
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PipelineChart({ data }: { data: Overview }) {
  const l = data.leads!
  const rows = l.stages.map((s) => ({ ...s }))
  return (
    <ChartCard
      title="Where this period's leads are now"
      subtitle={`${l.count} leads · ${l.conversion_pct ?? 0}% converted · win rate ${l.win_rate_pct ?? 0}% of closed`}
      table={<DataTable head={['Stage', 'Leads']} numeric={[1]} rows={rows.map((r) => [r.label, r.count])} />}
    >
      {l.count === 0 ? <Empty /> : <HBar rows={rows} dataKey="count" tooltip={(r) => [{ label: 'leads', value: String(r.count) }]} />}
    </ChartCard>
  )
}

function SourcesChart({ data }: { data: Overview }) {
  const rows = data.leads!.by_source
  return (
    <ChartCard
      title="Where leads come from"
      subtitle="Leads by source, with the share that became bookings"
      table={<DataTable head={['Source', 'Leads', 'Won', 'Conversion', 'Booked value']} numeric={[1, 2, 3, 4]} rows={rows.map((r) => [r.label, r.leads, r.won, r.conversion_pct === null ? '—' : `${r.conversion_pct}%`, fullINR(r.booked_value)])} />}
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <HBar
          rows={rows}
          dataKey="leads"
          tip={(r) => `${r.leads} · ${r.conversion_pct ?? 0}% won`}
          tooltip={(r) => [
            { label: 'leads', value: String(r.leads) },
            { label: 'won', value: String(r.won) },
            { label: 'booked', value: fullINR(r.booked_value) },
          ]}
        />
      )}
    </ChartCard>
  )
}

function EventTypesChart({ data }: { data: Overview }) {
  const rows = data.event_types
  return (
    <ChartCard
      title="Top event types"
      subtitle="Booked value of bookings confirmed in this period"
      table={<DataTable head={['Event type', 'Bookings', 'Booked value']} numeric={[1, 2]} rows={rows.map((r) => [r.label, r.count, fullINR(r.value)])} />}
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <HBar
          rows={rows}
          dataKey="value"
          tip={(r) => `${compactINR(r.value)} · ${r.count}`}
          tooltip={(r) => [
            { label: 'booked', value: fullINR(r.value) },
            { label: r.count === 1 ? 'booking' : 'bookings', value: String(r.count) },
          ]}
        />
      )}
    </ChartCard>
  )
}

// --- Tables ---------------------------------------------------------------------------------------

function TableCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-sans text-sm font-semibold text-stone-900">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-stone-500">{subtitle}</p>}
      <div className="overflow-x-auto text-sm">{children}</div>
    </section>
  )
}

function TopClients({ data }: { data: Overview }) {
  return (
    <TableCard title="Top clients" subtitle="By invoiced value (excl. GST) in this period">
      {data.top_clients.length === 0 ? (
        <Empty />
      ) : (
        <DataTable
          head={['Client', 'Invoices', 'Revenue', 'Still due']}
          numeric={[1, 2, 3]}
          rows={data.top_clients.map((c) => [
            // Rendered as plain text in the table component; link via the clients page.
            c.name,
            c.invoices,
            fullINR(c.revenue),
            Number(c.outstanding) ? fullINR(c.outstanding) : '—',
          ])}
        />
      )}
    </TableCard>
  )
}

function TeamTable({ data }: { data: Overview }) {
  return (
    <TableCard title="Team performance" subtitle="Leads received in this period, by owner">
      {data.team!.length === 0 ? (
        <Empty />
      ) : (
        <DataTable
          head={['Owner', 'Leads', 'Won', 'Lost', 'Conversion', 'Booked value']}
          numeric={[1, 2, 3, 4, 5]}
          rows={data.team!.map((t) => [t.name, t.leads, t.won, t.lost, t.conversion_pct === null ? '—' : `${t.conversion_pct}%`, fullINR(t.booked_value)])}
        />
      )}
    </TableCard>
  )
}

function LostReasons({ data }: { data: Overview }) {
  const reasons = data.leads!.lost_reasons
  return (
    <TableCard title="Why leads were lost" subtitle={`${data.leads!.lost} lost in this period`}>
      {reasons.length === 0 ? (
        <Empty text="No lost leads in this period." />
      ) : (
        <DataTable head={['Reason', 'Leads']} numeric={[1]} rows={reasons.map((r) => [r.reason, r.count])} />
      )}
      <p className="mt-2 text-xs text-stone-500">
        Reasons come from the “Mark lost” step on each <Link to="/admin/crm/leads" className="text-brand-700 hover:underline">lead</Link>.
      </p>
    </TableCard>
  )
}

function Empty({ text = 'No data for this period.' }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-stone-500">{text}</p>
}
