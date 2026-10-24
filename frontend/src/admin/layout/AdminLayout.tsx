import clsx from 'clsx'
import { LogOut, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const mainRef = useRef<HTMLElement>(null)
  // Only the content area scrolls, so the browser no longer resets it between pages; do it here.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])
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
    // App frame: the sidebar and the top bar stay put; only the page content (<main>) scrolls.
    // Printing goes back to normal flow so long documents aren't cut off.
    <div className="h-dvh overflow-hidden bg-stone-50 lg:grid lg:grid-cols-[16rem_1fr] print:block print:h-auto print:overflow-visible print:bg-white">
      <aside className="hidden overflow-y-auto bg-brand-800 lg:block print:hidden">{sidebar}</aside>

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

      <div className="flex h-dvh min-w-0 flex-col print:h-auto">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 lg:px-8 print:hidden">
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
        {/* The scrolling area has no padding of its own (the inner div has it): sticky bars such as
            "Save settings" respect a scroller's padding and would otherwise float above the bottom. */}
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <div className="p-4 lg:p-8">
            {/* Keyed by path so navigating away from a crashed page recovers. */}
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
