/** Colours, ink and number formats shared by the analytics charts. */

export const SERIES = {
  plum: '#8e3b74',
  gold: '#c9a14a',
}
export const INK = {
  primary: '#1c1917',
  secondary: '#57534e',
  muted: '#78716c',
  grid: '#e7e5e4',
  baseline: '#d6d3d1',
}

/** ₹950 · ₹12.5K · ₹3.4L · ₹1.2Cr — compact Indian units for axes and tiles. */
export function compactINR(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  const fmt = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ''))
  if (abs >= 1e7) return `${sign}₹${fmt(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${fmt(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${fmt(abs / 1e3)}K`
  return `${sign}₹${Math.round(abs)}`
}

export const fullINR = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const monthLabel = (ym: string, withYear = false) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', ...(withYear ? { year: '2-digit' } : {}) })
}

export const AXIS_TICK = { fill: INK.muted, fontSize: 12 }
