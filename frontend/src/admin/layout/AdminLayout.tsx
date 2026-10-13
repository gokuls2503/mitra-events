import clsx from 'clsx'
import { LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary'
import { ROLE_LABELS } from '@/shared/auth/roles'

import { usePipeline } from '../crm/api'
import { NAV } from './nav'

export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  // In-app indicator only (no email/WhatsApp alerts, by the owner's choice). Refreshes every minute.
  const { data: pipeline } = usePipeline({}, { refetchInterval: 60_000 })

  if (!user) return null
  const items = NAV.filter((item) => item.roles.includes(user.role))

  async function handleLogout() {
    await logout()
    navigate('/admin/login', { replace: true })
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Admin">
      <div className="mb-4 px-3 pt-2">
        <p className="font-display text-2xl font-semibold text-white">Mitra</p>
        <p className="text-xs tracking-widest text-gold-300 uppercase">Events admin</p>
      </div>
      {items.map((item) =>
        item.phase ? (
          <span
            key={item.to}
            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200/50"
            title={`Arrives in Phase ${item.phase}`}
          >
            <item.icon className="size-4" />
            {item.label}
            <span className="ml-auto rounded bg-white/10 px-1.5 text-[10px]">P{item.phase}</span>
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                isActive ? 'bg-white/15 font-medium text-white' : 'text-brand-100 hover:bg-white/10',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
            {item.badge === 'newLeads' && !!pipeline?.new_count && (
              <span className="ml-auto rounded-full bg-gold-400 px-1.5 text-[11px] font-semibold text-brand-900" aria-label={`${pipeline.new_count} new leads`}>
                {pipeline.new_count}
              </span>
            )}
          </NavLink>
        ),
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-stone-50 lg:grid lg:grid-cols-[16rem_1fr] print:block print:bg-white">
      <aside className="hidden bg-brand-800 lg:block print:hidden">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-64 bg-brand-800">
            <button
              className="absolute top-3 right-3 text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 lg:px-8 print:hidden">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <p className="font-medium">{user.full_name}</p>
              <p className="text-xs text-stone-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-stone-600 hover:bg-stone-100"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          {/* Keyed by path so navigating away from a crashed page recovers. */}
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
