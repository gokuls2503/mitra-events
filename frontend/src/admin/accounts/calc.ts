/**
 * Live preview of GST totals while editing. Mirrors apps/accounting/calc.py, working in whole
 * paise to avoid floating-point drift. The server recalculates on save and is the source of truth.
 */

export interface PreviewLine {
  quantity: string
  rate: string
  discount: string
  tax_rate: string
}

const paise = (v: string) => Math.round((Number(v) || 0) * 100)

export function previewLine(l: PreviewLine, intraState: boolean) {
  const gross = Math.round((Number(l.quantity) || 0) * paise(l.rate))
  const taxable = gross - paise(l.discount)
  const rate = Number(l.tax_rate) || 0
  const half = intraState ? Math.round((taxable * rate) / 200) : 0
  const igst = intraState ? 0 : Math.round((taxable * rate) / 100)
  return { taxable, cgst: half, sgst: half, igst, amount: taxable + 2 * half + igst }
}

export function previewTotals(lines: PreviewLine[], intraState: boolean) {
  const t = { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
  for (const l of lines) {
    const r = previewLine(l, intraState)
    t.taxable += r.taxable
    t.cgst += r.cgst
    t.sgst += r.sgst
    t.igst += r.igst
  }
  const exact = t.taxable + t.cgst + t.sgst + t.igst
  const total = Math.round(exact / 100) * 100
  return { ...t, roundOff: total - exact, total }
}

/** paise → rupees string with 2 decimals */
export const rupees = (p: number) => (p / 100).toFixed(2)
