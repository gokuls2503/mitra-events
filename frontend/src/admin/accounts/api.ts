import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/shared/api/client'

import type { Page, Params } from '../crm/api'

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'INVOICED'
export type VoucherType = 'SALES' | 'RECEIPT' | 'PAYMENT' | 'PURCHASE' | 'CONTRA' | 'JOURNAL'
export type ReceiptMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD'
export interface DrCr {
  amount: string
  side: 'Dr' | 'Cr'
}

export interface CompanyProfile {
  legal_name: string
  trade_name: string
  gstin: string
  pan: string
  state_code: string
  state_name: string
  address: string
  phone: string
  email: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
  bank_ifsc: string
  bank_branch: string
  upi_id: string
  invoice_prefix: string
  quotation_prefix: string
  receipt_prefix: string
  expense_prefix: string
  voucher_prefix: string
  default_sac: string
  default_tax_rate: number | null
  invoice_due_days: number
  quotation_valid_days: number
  invoice_terms: string
  quotation_terms: string
  authorised_signatory: string
  states: { code: string; name: string }[]
}

export interface TaxRate {
  id: number
  name: string
  rate: string
  is_active: boolean
}

export interface AccountGroup {
  id: number
  name: string
  parent: number | null
  parent_name: string | null
  nature: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE'
  nature_label: string
  is_system: boolean
}

export interface Ledger {
  id: number
  name: string
  group: number
  group_name: string
  nature: AccountGroup['nature']
  system_code: string | null
  client: number | null
  vendor: number | null
  opening_balance: string
  gstin: string
  bank_details: string
  is_active: boolean
  balance: DrCr | null
  is_system: boolean
}

export interface Item {
  description: string
  sac: string
  quantity: string
  unit: string
  rate: string
  discount: string
  tax_rate: string
  taxable_amount?: string
  cgst?: string
  sgst?: string
  igst?: string
  amount?: string
}

interface SalesDoc {
  id: number
  client: number
  client_name: string
  client_gstin: string
  booking: number | null
  booking_title: string | null
  booking_number: string | null
  place_of_supply: string
  place_of_supply_name: string
  notes: string
  terms: string
  items: Item[]
  subtotal: string
  discount_total: string
  taxable_total: string
  cgst_total: string
  sgst_total: string
  igst_total: string
  round_off: string
  total: string
  status_label: string
  created_at: string
}

export interface Quotation extends SalesDoc {
  number: string
  lead: number | null
  date: string
  valid_until: string | null
  status: QuotationStatus
}

export interface Allocation {
  id: number
  receipt: number
  receipt_number: string
  receipt_date: string
  receipt_cancelled: boolean
  invoice: number
  invoice_number: string
  amount: string
}

export interface Invoice extends SalesDoc {
  number: string | null
  quotation: number | null
  quotation_number: string | null
  invoice_date: string
  due_date: string | null
  status: InvoiceStatus
  amount_paid: string
  balance_due: string
  billing_name: string
  billing_address: string
  billing_gstin: string
  issued_at: string | null
  cancel_reason: string
  allocations: Allocation[]
}

export interface Receipt {
  id: number
  number: string
  client: number
  client_name: string
  booking: number | null
  booking_title: string | null
  date: string
  amount: string
  mode: ReceiptMode
  mode_label: string
  deposit_to: number
  deposit_to_name: string
  reference: string
  notes: string
  is_cancelled: boolean
  allocations: Allocation[]
  allocated: string
  unapplied: string
}

export interface Expense {
  id: number
  number: string
  date: string
  expense_ledger: number
  expense_ledger_name: string
  vendor: number | null
  vendor_name: string | null
  booking: number | null
  booking_title: string | null
  description: string
  bill_number: string
  amount: string
  tax_rate: string
  is_interstate: boolean
  cgst: string
  sgst: string
  igst: string
  total: string
  paid_from: number | null
  paid_from_name: string | null
  attachment: string | null
  is_cancelled: boolean
}

export interface JournalEntry {
  id: number
  number: string
  date: string
  voucher_type: VoucherType
  voucher_type_label: string
  narration: string
  is_manual: boolean
  is_cancelled: boolean
  lines: { id: number; ledger: number; ledger_name: string; debit: string; credit: string; note: string }[]
  source: { kind: 'invoice' | 'receipt' | 'expense'; id: number } | null
  total: string
}

export interface BookingFinance {
  quotations: { id: number; number: string; status: QuotationStatus; status_label: string; total: string; date: string }[]
  invoices: { id: number; number: string; status: InvoiceStatus; status_label: string; total: string; balance_due: string; date: string }[]
  drafts: { id: number; total: string }[]
  invoiced: string
  received: string
  balance_due: string
  expenses: string
  margin: string | null
}

const clean = (p: Params) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''))

function listQuery<T>(path: string, params: Params) {
  return {
    queryKey: ['accounts', path, clean(params)],
    queryFn: async () => (await api.get<Page<T>>(`/accounts/${path}/`, { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  }
}

function detailQuery<T>(path: string, id: number) {
  return { queryKey: ['accounts', path, id], queryFn: async () => (await api.get<T>(`/accounts/${path}/${id}/`)).data, enabled: id > 0 }
}

export const useSettings = () =>
  useQuery({ queryKey: ['accounts', 'settings'], queryFn: async () => (await api.get<CompanyProfile>('/accounts/settings/')).data, staleTime: 5 * 60_000 })
export const useTaxRates = () =>
  useQuery({ queryKey: ['accounts', 'tax-rates'], queryFn: async () => (await api.get<TaxRate[]>('/accounts/tax-rates/')).data, staleTime: 5 * 60_000 })
export const useGroups = () =>
  useQuery({ queryKey: ['accounts', 'groups'], queryFn: async () => (await api.get<AccountGroup[]>('/accounts/groups/')).data, staleTime: 5 * 60_000 })
export const useLedgers = (params: Params = {}) =>
  useQuery({
    queryKey: ['accounts', 'ledgers', clean(params)],
    queryFn: async () => (await api.get<Ledger[]>('/accounts/ledgers/', { params: clean(params) })).data,
  })

export interface LedgerStatement {
  ledger: { id: number; name: string; group: string }
  opening: DrCr
  closing: DrCr
  total_debit: string
  total_credit: string
  rows: {
    date: string
    entry_id: number
    number: string
    voucher_type: string
    particulars: string
    narration: string
    debit: string
    credit: string
    balance: DrCr
  }[]
}

export const useLedgerStatement = (id: number, from: string, to: string) =>
  useQuery({
    queryKey: ['accounts', 'statement', id, from, to],
    queryFn: async () => (await api.get<LedgerStatement>(`/accounts/ledgers/${id}/statement/`, { params: { from, to } })).data,
    placeholderData: keepPreviousData,
  })

export const useQuotations = (params: Params) => useQuery(listQuery<Quotation>('quotations', params))
export const useQuotation = (id: number) => useQuery(detailQuery<Quotation>('quotations', id))
export const useInvoices = (params: Params) => useQuery(listQuery<Invoice>('invoices', params))
export const useInvoice = (id: number) => useQuery(detailQuery<Invoice>('invoices', id))
export const useReceipts = (params: Params) => useQuery(listQuery<Receipt>('receipts', params))
export const useExpenses = (params: Params) => useQuery(listQuery<Expense>('expenses', params))
export const useVouchers = (params: Params) => useQuery(listQuery<JournalEntry>('vouchers', params))

export const useBookingFinance = (bookingId: number, enabled = true) =>
  useQuery({
    queryKey: ['accounts', 'booking-finance', bookingId],
    queryFn: async () => (await api.get<BookingFinance>(`/accounts/bookings/${bookingId}/summary/`)).data,
    enabled,
  })

export function useReport<T>(name: string, params: Params, enabled = true) {
  return useQuery({
    queryKey: ['accounts', 'report', name, clean(params)],
    queryFn: async () => (await api.get<T>(`/accounts/reports/${name}/`, { params: clean(params) })).data,
    enabled,
    // Keep showing the old numbers while dates change — but never another report's data,
    // which has a different shape.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === name ? prev : undefined),
  })
}

/** Accounting writes ripple everywhere (balances, invoices, dashboard), so refresh it all; not awaited. */
export function useAccountsMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['ops', 'dashboard'] })
    },
  })
}

type Body = Record<string, unknown>
const post = async <T>(url: string, body: Body = {}) => (await api.post<T>(url, body)).data
const save = async <T>(path: string, { id, ...data }: Body & { id?: number }) =>
  (id ? await api.patch<T>(`/accounts/${path}/${id}/`, data) : await api.post<T>(`/accounts/${path}/`, data)).data

export const accounts = {
  saveSettings: async (data: Partial<CompanyProfile>) => (await api.patch<CompanyProfile>('/accounts/settings/', data)).data,
  saveTaxRate: (data: Partial<TaxRate>) => save<TaxRate>('tax-rates', data as Body),
  saveGroup: (data: Partial<AccountGroup>) => save<AccountGroup>('groups', data as Body),
  saveLedger: (data: Partial<Ledger>) => save<Ledger>('ledgers', data as Body),
  deleteLedger: (id: number) => api.delete(`/accounts/ledgers/${id}/`),
  saveQuotation: (data: Body & { id?: number }) => save<Quotation>('quotations', data),
  deleteQuotation: (id: number) => api.delete(`/accounts/quotations/${id}/`),
  quotationStatus: ({ id, status }: { id: number; status: QuotationStatus }) => post<Quotation>(`/accounts/quotations/${id}/set-status/`, { status }),
  convertQuotation: (id: number) => post<Invoice>(`/accounts/quotations/${id}/convert/`),
  saveInvoice: (data: Body & { id?: number }) => save<Invoice>('invoices', data),
  deleteInvoice: (id: number) => api.delete(`/accounts/invoices/${id}/`),
  issueInvoice: (id: number) => post<Invoice>(`/accounts/invoices/${id}/issue/`),
  cancelInvoice: ({ id, reason }: { id: number; reason: string }) => post<Invoice>(`/accounts/invoices/${id}/cancel/`, { reason }),
  createReceipt: (data: Body) => post<Receipt>('/accounts/receipts/', data),
  allocateReceipt: ({ id, apply_to }: { id: number; apply_to: { invoice: number; amount: string }[] }) =>
    post<Receipt>(`/accounts/receipts/${id}/allocate/`, { apply_to }),
  cancelReceipt: (id: number) => post<Receipt>(`/accounts/receipts/${id}/cancel/`),
  saveExpense: async ({ id, data }: { id?: number; data: FormData }) =>
    (id ? await api.patch<Expense>(`/accounts/expenses/${id}/`, data) : await api.post<Expense>('/accounts/expenses/', data)).data,
  cancelExpense: (id: number) => post<Expense>(`/accounts/expenses/${id}/cancel/`),
  createVoucher: (data: Body) => post<JournalEntry>('/accounts/vouchers/', data),
  cancelVoucher: (id: number) => post<JournalEntry>(`/accounts/vouchers/${id}/cancel/`),
}

/**
 * PDFs and spreadsheets need the auth header, so they can't be plain links.
 * PDFs open in a new tab; spreadsheets download.
 *
 * For PDFs the tab is opened *synchronously* (still inside the click), then pointed at the
 * file once it arrives — opening it after the download would be treated as a popup and blocked.
 */
export async function openFile(url: string, params: Params = {}, kind: 'pdf' | 'xlsx' = 'pdf') {
  const tab = kind === 'pdf' ? window.open('', '_blank') : null
  if (tab) {
    tab.opener = null
    tab.document.title = 'Loading…'
    tab.document.body.textContent = 'Preparing PDF…'
  }
  try {
    const res = await api.get<Blob>(url, { params: clean(params), responseType: 'blob' })
    const blobUrl = URL.createObjectURL(res.data)
    if (tab) {
      tab.location.href = blobUrl
    } else {
      const disposition = String(res.headers['content-disposition'] ?? '')
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'download'
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ISSUED', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partly paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export const RECEIPT_MODES: { value: ReceiptMode; label: string }[] = [
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer (NEFT/IMPS/RTGS)' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
]

export const VOUCHER_TYPES: { value: VoucherType; label: string; manual: boolean }[] = [
  { value: 'PAYMENT', label: 'Payment', manual: true },
  { value: 'RECEIPT', label: 'Receipt', manual: true },
  { value: 'CONTRA', label: 'Contra (cash ⇄ bank)', manual: true },
  { value: 'JOURNAL', label: 'Journal', manual: true },
  { value: 'PURCHASE', label: 'Purchase / expense', manual: true },
  { value: 'SALES', label: 'Sales', manual: false },
]
