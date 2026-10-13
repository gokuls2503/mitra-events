import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'

import { usePipeline } from './api'

export default function CrmLayout() {
  const { user } = useAuth()
  const { data: pipeline } = usePipeline()
  const tabs = [
    { to: 'leads', label: 'Leads', badge: pipeline?.new_count },
    { to: 'follow-ups', label: user?.role === 'STAFF' ? 'My follow-ups' : 'Follow-ups' },
    { to: 'clients', label: 'Clients' },
  ]
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold text-brand-800">Leads & clients</h1>
      <nav aria-label="CRM sections" className="-mx-4 mb-6 overflow-x-auto border-b border-stone-200 px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  clsx(
                    '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                    isActive ? 'border-brand-700 font-medium text-brand-800' : 'border-transparent text-stone-600 hover:text-stone-900',
                  )
                }
              >
                {t.label}
                {!!t.badge && (
                  <span className="rounded-full bg-sky-600 px-1.5 text-[11px] font-semibold text-white" aria-label={`${t.badge} new`}>
                    {t.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
