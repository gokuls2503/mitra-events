import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'

export default function OpsLayout() {
  const { hasRole } = useAuth()
  const tabs = [
    { to: 'tasks', label: hasRole('STAFF') ? 'My tasks' : 'Tasks' },
    { to: 'vendors', label: 'Vendors' },
  ]
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold text-brand-800">Tasks & vendors</h1>
      <nav aria-label="Operations sections" className="-mx-4 mb-6 overflow-x-auto border-b border-stone-200 px-4 lg:mx-0 lg:px-0">
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
