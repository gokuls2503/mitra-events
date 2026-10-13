/** Date helpers for the admin. All display is Indian English, in the browser's local time (IST). */

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' })
const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })

/** "2026-10-06" → local Date at midnight (not UTC, which would shift the day). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const todayISO = () => toISODate(new Date())

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(iso.length === 10 ? parseDate(iso) : new Date(iso)) : '—')
export const fmtShortDate = (iso: string) => shortDateFmt.format(iso.length === 10 ? parseDate(iso) : new Date(iso))
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')
export const fmtTime = (hhmm: string | null | undefined) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return timeFmt.format(new Date(2000, 0, 1, h, m))
}
export const fmtWeekday = (iso: string) => weekdayFmt.format(parseDate(iso))

/** "in 3 days", "yesterday", "2 hours ago". */
export function fromNow(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'minute') return rtf.format(Math.round(diffMs / ms), unit)
  }
  return ''
}

/** Days from today until a YYYY-MM-DD date (negative = past). */
export function daysUntil(iso: string): number {
  const today = parseDate(todayISO())
  return Math.round((parseDate(iso).getTime() - today.getTime()) / 86_400_000)
}

/** <input type="datetime-local"> value ⇄ ISO string with timezone. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${toISODate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const fromLocalInput = (value: string) => new Date(value).toISOString()

/** True if the timestamp is in the past (re-evaluated on every render, which is what overdue badges want). */
export const isPast = (iso: string) => new Date(iso).getTime() < Date.now()

/** Tomorrow at the given local hour, e.g. the default time for a new follow-up. */
export function tomorrowAt(hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}
