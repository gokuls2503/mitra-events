/**
 * Chart building blocks, following the data-viz rules used across the admin:
 *  - brand plum (slot 1) and gold (slot 2), validated for colour-blind separation;
 *    gold is < 3:1 on white, so every chart also offers a table view
 *  - one y-axis only; thin bars (<= 24px) with 4px rounded data-ends; solid hairline grid
 *  - tooltips lead with the value; text never wears the series colour
 */
import { useId, useState, type ReactNode } from 'react'

export interface LegendItem {
  label: string
  color: string
}

/** Card with title, optional legend (only for 2+ series) and a table view toggle. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  table?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [showTable, setShowTable] = useState(false)
  const id = useId()
  return (
    <section className={`min-w-0 rounded-xl border border-stone-200 bg-white p-5 ${className ?? ''}`} aria-labelledby={id}>
      <header className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-1">
        <div>
          <h2 id={id} className="font-sans text-sm font-semibold text-stone-900">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
        {legend && legend.length > 1 && (
          <ul className="flex flex-wrap gap-3 text-xs text-stone-600" aria-label="Legend">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm" style={{ background: l.color }} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
        )}
        {table && (
          <button onClick={() => setShowTable((s) => !s)} className="ml-auto text-xs text-brand-700 hover:underline" aria-expanded={showTable}>
            {showTable ? 'Show chart' : 'Show as table'}
          </button>
        )}
      </header>
      {showTable && table ? <div className="overflow-x-auto text-sm">{table}</div> : children}
    </section>
  )
}

/** Tooltip body: value first and strong, series name secondary, keyed by a short line. */
export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-stone-500">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} aria-hidden />}
          <span className="font-semibold text-stone-900 tabular-nums">{r.value}</span>
          <span className="text-stone-500">{r.label}</span>
        </p>
      ))}
    </div>
  )
}

export function DataTable({ head, rows, numeric }: { head: string[]; rows: (string | number)[][]; numeric?: number[] }) {
  return (
    <table className="w-full min-w-[24rem]">
      <thead className="border-b border-stone-200 text-left text-xs text-stone-500">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 font-medium ${numeric?.includes(i) ? 'text-right' : ''}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((r, n) => (
          <tr key={n}>
            {r.map((c, i) => (
              <td key={i} className={`py-1.5 ${numeric?.includes(i) ? 'text-right tabular-nums' : ''}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
