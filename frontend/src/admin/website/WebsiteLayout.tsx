import clsx from 'clsx'
import { ExternalLink } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: 'settings', label: 'Site settings' },
  { to: 'services', label: 'Services' },
  { to: 'packages', label: 'Packages' },
  { to: 'testimonials', label: 'Testimonials' },
  { to: 'estimator', label: 'Cost estimator' },
]

export default function WebsiteLayout() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-brand-800">Website content</h1>
          <p className="text-sm text-stone-600">Changes appear on the website as soon as you save.</p>
        </div>
        <a href="/" target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
          View website <ExternalLink className="size-3.5" />
        </a>
      </div>
      <nav aria-label="Website sections" className="-mx-4 mb-6 overflow-x-auto border-b border-stone-200 px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-1">
          {TABS.map((t) => (
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
