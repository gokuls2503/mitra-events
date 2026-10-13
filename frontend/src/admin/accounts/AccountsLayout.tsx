import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'

import { useSettings } from './api'

export default function AccountsLayout() {
  const { hasRole } = useAuth()
  const full = hasRole('OWNER', 'ACCOUNTANT')
  const { data: settings } = useSettings()
  const tabs = [
    { to: 'invoices', label: 'Invoices' },
    { to: 'quotations', label: 'Quotations' },
    { to: 'receipts', label: 'Receipts' },
    { to: 'expenses', label: 'Expenses' },
    { to: 'ledgers', label: 'Ledgers' },
    { to: 'vouchers', label: 'Vouchers' },
    ...(full ? [{ to: 'reports', label: 'Reports' }] : []),
    { to: 'settings', label: 'Settings' },
  ]
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold text-brand-800">Accounts & billing</h1>
      {full && settings && !settings.gstin && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Add your GSTIN, address and bank details under <NavLink to="settings" className="font-medium underline">Settings</NavLink> before issuing invoices.
        </p>
      )}
      <nav aria-label="Accounts sections" className="-mx-4 mb-6 overflow-x-auto border-b border-stone-200 px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  clsx(
                    '-mb-px block border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                    isActive ? 'border-brand-700 font-medium text-brand-800' : 'border-transparent text-stone-600 hover:text-stone-900',
                  )
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
