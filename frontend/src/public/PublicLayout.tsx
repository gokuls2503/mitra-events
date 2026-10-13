import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Mail, MapPin, Menu, MessageCircle, Navigation, Phone, X } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { directionsLink, mapsLink, telLink, waLink } from '@/shared/format'

import { servicesQuery, settingsQuery } from './api'
import { CornerSwoosh, Logo } from './components/Brand'
import { FacebookIcon, InstagramIcon, YoutubeIcon } from './components/SocialIcons'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services' },
  { to: '/packages', label: 'Packages' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/testimonials', label: 'Testimonials' },
  { to: '/contact', label: 'Contact' },
]

const YEAR = new Date().getFullYear()

export function PublicLayout() {
  const { pathname } = useLocation()
  // The menu belongs to the page it was opened on, so navigating closes it without an effect.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const menuOpen = menuOpenOn === pathname
  const [scrolled, setScrolled] = useState(false)
  const { data: site } = useQuery(settingsQuery)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header
          className={clsx(
            'sticky top-0 z-40 transition-all duration-300',
            scrolled ? 'border-b border-gold-200 bg-ivory/90 shadow-sm backdrop-blur-md' : 'border-b border-transparent bg-ivory',
          )}
        >
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link to="/" className="shrink-0" aria-label={`${site?.business_name ?? 'Mitra Events Management'} home`}>
              <Logo />
            </Link>
            <nav className="ml-auto hidden lg:block" aria-label="Main">
              <ul className="flex items-center gap-1">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        clsx(
                          'relative rounded-full px-3 py-2 text-sm font-medium transition',
                          isActive ? 'text-brand-800' : 'text-stone-600 hover:text-brand-700',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {item.label}
                          {isActive && (
                            <motion.span
                              layoutId="nav-underline"
                              className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded bg-gold-500"
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <Link
              to="/estimate"
              className="ml-auto hidden rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-brand-800 sm:block lg:ml-2"
            >
              Get an estimate
            </Link>
            <button
              className="ml-auto rounded-lg p-2 text-brand-800 sm:ml-0 lg:hidden"
              onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
          <AnimatePresence>
            {menuOpen && (
              <motion.nav
                id="mobile-nav"
                aria-label="Mobile"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-brand-100 bg-ivory lg:hidden"
              >
                <ul className="space-y-1 px-4 py-3">
                  {NAV.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          clsx('block rounded-lg px-3 py-2.5 font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-700')
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                  <li>
                    <Link to="/estimate" className="mt-2 block rounded-full bg-brand-700 px-4 py-3 text-center font-semibold text-white">
                      Get an estimate
                    </Link>
                  </li>
                </ul>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main id="main" className="flex-1">
          <Outlet />
        </main>

        <Footer />

        {site?.whatsapp && (
          <a
            href={waLink(site.whatsapp, 'Hi Mitra Events, I would like to know more about your decor services.')}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="fixed right-4 bottom-4 z-30 grid size-14 place-items-center rounded-full bg-green-600 text-white shadow-xl transition hover:scale-105 hover:bg-green-700"
          >
            <MessageCircle className="size-7" />
          </a>
        )}
      </div>
    </MotionConfig>
  )
}

function Footer() {
  const { data: site } = useQuery(settingsQuery)
  const { data: services } = useQuery(servicesQuery)
  const socials = [
    { href: site?.instagram_url, label: 'Instagram', Icon: InstagramIcon },
    { href: site?.facebook_url, label: 'Facebook', Icon: FacebookIcon },
    { href: site?.youtube_url, label: 'YouTube', Icon: YoutubeIcon },
  ].filter((s) => s.href)
  const heading = 'font-caps text-sm font-semibold tracking-[0.2em] text-brand-800 uppercase'
  const link = 'inline-flex min-h-11 items-center hover:text-brand-700 hover:underline'

  return (
    <footer className="relative isolate overflow-hidden border-t border-gold-300 bg-cream text-stone-700">
      <CornerSwoosh corner="bottom-right" size="sm" className="-z-10 opacity-90" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link to="/" aria-label={`${site?.business_name ?? 'Mitra Events Management'} home`}>
            <Logo />
          </Link>
          <p className="mt-4 font-caps text-xs font-semibold tracking-[0.25em] text-brand-700 uppercase">Events beyond expectation</p>
          {site?.tagline && <p className="mt-2 text-sm">{site.tagline}</p>}
          {socials.length > 0 && (
            <div className="mt-5 flex gap-2">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid size-11 place-items-center rounded-full text-gold-700 ring-1 ring-gold-400 transition hover:bg-gold-100"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className={heading}>Explore</h2>
          <ul className="mt-3 text-sm">
            {[...NAV.slice(1), { to: '/estimate', label: 'Cost estimator' }].map((n) => (
              <li key={n.to}>
                <Link to={n.to} className={link}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={heading}>Services</h2>
          <ul className="mt-3 text-sm">
            {services?.slice(0, 7).map((s) => (
              <li key={s.slug}>
                <Link to={`/services/${s.slug}`} className={link}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={heading}>Contact</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {[site?.phone, site?.phone_2].filter(Boolean).map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-gold-600" />
                <a href={telLink(p!)} className={clsx(link, 'font-medium text-brand-800 tabular-nums')} aria-label={`Call ${p}`}>
                  {p}
                </a>
              </li>
            ))}
            {site?.email && (
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-gold-600" />
                <a href={`mailto:${site.email}`} className={clsx(link, 'break-all text-brand-800')}>
                  {site.email}
                </a>
              </li>
            )}
            {site?.address && (
              <li className="flex gap-2.5 pt-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" />
                <div>
                  <a href={mapsLink(site.address)} target="_blank" rel="noopener noreferrer" className="block whitespace-pre-line hover:text-brand-700 hover:underline">
                    {site.address}
                  </a>
                  <a
                    href={directionsLink(site.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                  >
                    <Navigation className="size-4" /> Get directions
                  </a>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-gold-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 px-4 py-3 pr-24 text-xs text-stone-600 sm:px-6 sm:pr-56">
          <p suppressHydrationWarning>
            © {YEAR} {site?.business_name ?? 'Mitra Events Management'}, {site?.city ?? 'Coimbatore'}
          </p>
          <Link to="/admin" className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline" rel="nofollow">
            Staff login
          </Link>
        </div>
      </div>
    </footer>
  )
}
