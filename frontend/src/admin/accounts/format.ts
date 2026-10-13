import { formatINR } from '@/shared/format'

/** Compact ₹ display used in tight table cells. */
export const inr = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : formatINR(v))

export function fyStartISO(today = new Date()) {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${y}-04-01`
}
