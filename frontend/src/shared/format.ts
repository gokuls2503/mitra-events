const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** ₹1,75,000 — Indian digit grouping. */
export function formatINR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  return inr.format(Number(value))
}

export function waLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/** One-line search text for an address written over several lines. */
function mapsQuery(address: string) {
  return address
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean)
    .join(', ')
    .replace(/\s+–\s+/g, ' ')
}

/** Opens the address in Google Maps (the Maps app on phones). */
export function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(address))}`
}

/** Opens Google Maps with directions to the address from where the visitor is. */
export function directionsLink(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(address))}`
}

/** "+919876543210" → "+91 98765 43210". */
export function prettyPhone(phone: string) {
  const m = phone.match(/^\+91(\d{5})(\d{5})$/)
  return m ? `+91 ${m[1]} ${m[2]}` : phone
}

/** ₹6,550 for whole rupees, ₹876.25 when there are paise — Indian grouping either way. */
export function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
