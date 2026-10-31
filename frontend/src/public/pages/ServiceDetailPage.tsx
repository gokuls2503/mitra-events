import { useQuery } from '@tanstack/react-query'
import {
  Armchair,
  Baby,
  BadgeCheck,
  Brush,
  Building2,
  Cake,
  Calculator,
  CalendarCheck,
  CalendarClock,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Crown,
  DoorOpen,
  Flame,
  Flower2,
  Gem,
  IndianRupee,
  Landmark,
  Leaf,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Palette,
  PartyPopper,
  Percent,
  Phone,
  Presentation,
  Receipt,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trophy,
  Users,
  Utensils,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'

import { formatINR, waLink } from '@/shared/format'

import { galleryQuery, serviceQuery, settingsQuery, type GalleryImage, type Service, type SiteSettings } from '../api'
import { LotusMark } from '../components/Brand'
import { EnquiryForm } from '../components/LazyEnquiryForm'
import { SERVICE_HERO_PHOTO } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { SITE_URL, pageTitle } from '../head'
import { Seo } from '../Seo'
import NotFoundPage from './NotFoundPage'

const SLIDE_SECONDS = 5

// A fitting icon for each keyword chip, by the first word pattern it matches; sparkles otherwise.
const KEYWORD_ICONS: [RegExp, LucideIcon][] = [
  [/\b(flowers?|floral|garlands?)\b/i, Flower2],
  [/\b(light|lighting|led)\b/i, Lightbulb],
  [/\b(award|trophy)\b/i, Trophy],
  [/\b(av|sound|mic)\b/i, Mic],
  [/\b(photo|camera)\b/i, Camera],
  [/\bcake\b/i, Cake],
  [/\b(balloons?|balloon|theme|party)\b/i, PartyPopper],
  [/\b(kids?|kids'|baby|child)/i, Baby],
  [/\b(ring|engagement)\b/i, Gem],
  [/\b(entrance|aisle|arch|door)\b/i, DoorOpen],
  [/\b(dining|food|table)\b/i, Utensils],
  [/\b(kolam|rangoli)\b/i, Brush],
  [/\b(lamps?|diya)\b/i, Flame],
  [/\b(temple|puja|mandap)\b/i, Landmark],
  [/\b(stage|backdrop|branded)\b/i, Presentation],
  [/\b(seating|seat|swing|oonjal|chairs?)\b/i, Armchair],
  [/\b(leaf|thoranam|green)/i, Leaf],
  [/\b(registration|desk|plan)\b/i, ClipboardList],
  [/\b(setup|clearing)\b/i, Wrench],
]
const pickIcon = (text: string, table: [RegExp, LucideIcon][], fallback: LucideIcon) => table.find(([pattern]) => pattern.test(text))?.[1] ?? fallback
const keywordIcon = (text: string, fallback: LucideIcon = Sparkles) => pickIcon(text, KEYWORD_ICONS, fallback)

// "Label: value" rows under Service details, by their label.
const DETAIL_ICONS: [RegExp, LucideIcon][] = [
  [/occasion|event/i, PartyPopper],
  [/area|location|city/i, MapPin],
  [/pric|cost|rate/i, Tag],
  [/custom|theme|colour/i, Palette],
  [/setup|time/i, Clock],
  [/day|team|staff/i, Users],
]
const POLICY_ICONS: [RegExp, LucideIcon][] = [
  [/\bbook|ahead|dates?\b/i, CalendarClock],
  [/venue|hall|permission/i, Building2],
  [/confirm/i, BadgeCheck],
  [/design|plan/i, Palette],
]
const PAYMENT_ICONS: [RegExp, LucideIcon][] = [
  [/refund/i, RotateCcw],
  [/advance|%/i, Wallet],
  [/balance/i, Receipt],
  [/gst|tax/i, Percent],
  [/valid|days/i, Clock],
]

export default function ServiceDetailPage() {
  const { slug = '' } = useParams()
  const { data: site } = useQuery(settingsQuery)
  const { data: service, isError, isLoading } = useQuery(serviceQuery(slug))
  const { data: gallery } = useQuery(galleryQuery)
  const title = pageTitle(service?.seo_title || service?.name || null, site)

  if (isError) return <NotFoundPage />
  if (isLoading || !service) return <div className="min-h-[60vh]" />

  const related = gallery?.filter((g) => g.category === service.category).slice(0, 12) ?? []
  const city = site?.city ?? 'Coimbatore'

  return (
    <>
      <Seo
        title={title}
        description={service.seo_description || service.short_description}
        path={`/services/${service.slug}`}
        image={service.cover_image ?? service.images[0]?.image}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: service.name,
            description: service.short_description,
            serviceType: service.category_label,
            areaServed: city,
            provider: { '@id': `${SITE_URL}/#business` },
            ...(service.starting_price && {
              offers: {
                '@type': 'Offer',
                priceCurrency: 'INR',
                price: service.starting_price,
              },
            }),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `${SITE_URL}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Services',
                item: `${SITE_URL}/services`,
              },
              { '@type': 'ListItem', position: 3, name: service.name },
            ],
          },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-5 text-sm">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link to="/" className="text-brand-600 hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-stone-400">
              /
            </li>
            <li>
              <Link to="/services" className="text-brand-600 hover:underline">
                Services
              </Link>
            </li>
            <li aria-hidden="true" className="text-stone-400">
              /
            </li>
            <li aria-current="page" className="text-stone-500">
              {service.name}
            </li>
          </ol>
        </nav>

        {/* Photos on the left, the details on the right; stacked on phones. */}
        <div className="grid gap-8 rounded-3xl bg-white p-3 shadow-xl shadow-brand-900/5 ring-1 ring-gold-200 sm:p-4 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
          <ServiceSlideshow service={service} />

          <div className="flex flex-col px-2 pb-4 sm:px-3 lg:py-4 lg:pr-6">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 bg-brand-700 py-1.5 pr-7 pl-3 text-sm font-semibold text-white [clip-path:polygon(0_0,100%_0,calc(100%-14px)_50%,100%_100%,0_100%)]">
                <Crown className="size-4 text-gold-300" /> {service.category_label}
              </span>
              <ShareButton title={service.name} />
            </div>

            <h1 className="mt-5 text-4xl leading-tight font-semibold text-brand-800 sm:text-5xl">{service.name}</h1>
            <p className="mt-3 text-lg text-stone-700">{service.short_description}</p>
            <Link to="/contact" className="mt-3 inline-flex items-center gap-1.5 self-start text-brand-600 underline-offset-4 hover:underline">
              <MapPin className="size-4 text-gold-600" /> Serving {city} &amp; Tirupur
            </Link>

            {service.starting_price && (
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                <span className="w-full font-caps text-xs font-semibold tracking-[0.2em] text-gold-700 uppercase">Starting from</span>
                <span className="font-display text-4xl font-semibold text-brand-800">{formatINR(service.starting_price)}</span>
                <span className="text-stone-500">onwards</span>
              </p>
            )}

            {service.keywords.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2.5">
                {service.keywords.map((k) => {
                  const Icon = keywordIcon(k)
                  return (
                    <li key={k} className="inline-flex items-center gap-2 rounded-full bg-blush-light px-4 py-2 text-sm text-stone-700 ring-1 ring-gold-200">
                      <Icon className="size-4 text-gold-600" aria-hidden="true" />
                      {k}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:mt-auto lg:pt-8">
              <a
                href="#enquire"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold text-brand-700 ring-1 ring-brand-600 transition hover:bg-brand-50"
              >
                <CalendarCheck className="size-5" /> Check availability
              </a>
              {site?.phone ? (
                <a
                  href={`tel:${site.phone.replace(/\s/g, '')}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white shadow-lg shadow-brand-700/20 transition hover:bg-brand-800"
                >
                  <Phone className="size-5" /> Call {site.phone}
                </a>
              ) : (
                <Link
                  to="/estimate"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white transition hover:bg-brand-800"
                >
                  <Calculator className="size-5" /> Estimate my event
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <ServiceSections service={service} related={related} />

      <ServiceEnquiry service={service} site={site} />
    </>
  )
}

/**
 * The enquiry block at the foot of the page: one card with Mitra's contact details on a deep purple
 * panel and the enquiry form beside it (stacked on phones, contact details first).
 */
function ServiceEnquiry({ service, site }: { service: Service; site: SiteSettings | undefined }) {
  const phones = [site?.phone, site?.phone_2].filter((p): p is string => Boolean(p))
  type Contact = { icon: LucideIcon; label: string; body: ReactNode }
  const rows: (Contact | false | '' | undefined)[] = [
    phones.length > 0 && {
      icon: Phone,
      label: 'Call us',
      body: (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {phones.map((p) => (
            <a key={p} href={`tel:${p.replace(/\s/g, '')}`} className="hover:text-gold-200">
              {p}
            </a>
          ))}
        </span>
      ),
    },
    site?.whatsapp && {
      icon: MessageCircle,
      label: 'WhatsApp',
      body: (
        <a
          href={waLink(site.whatsapp, `Hi Mitra Events, I'd like to know more about ${service.name}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gold-200"
        >
          Chat with us now
        </a>
      ),
    },
    site?.email && {
      icon: Mail,
      label: 'Email',
      body: (
        <a href={`mailto:${site.email}`} className="[overflow-wrap:anywhere] hover:text-gold-200">
          {site.email}
        </a>
      ),
    },
    site?.address && { icon: MapPin, label: 'Visit us', body: <span className="whitespace-pre-line">{site.address}</span> },
    site?.business_hours && { icon: Clock, label: 'Hours', body: site.business_hours },
  ]
  const contacts = rows.filter((c): c is Contact => Boolean(c))
  const stats = site
    ? [
        { value: site.stat_events, label: 'Events' },
        { value: site.stat_years, label: 'Years' },
        { value: site.stat_clients, label: 'Families' },
      ].filter((stat) => stat.value > 0)
    : []

  return (
    <section id="enquire" className="scroll-mt-24 border-t border-gold-200 bg-linear-to-b from-blush-light to-[#f6e7ef] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-brand-900/10 ring-1 ring-gold-200 lg:grid lg:grid-cols-[0.85fr_1.15fr]">
          {/* Contact panel */}
          <div className="relative isolate overflow-hidden bg-linear-to-br from-brand-700 via-brand-800 to-brand-900 px-6 py-10 text-white sm:px-10 sm:py-12">
            <LotusMark tone="gold" className="absolute -top-8 -right-20 -z-10 w-72 opacity-10!" />
            <span aria-hidden="true" className="absolute -top-24 -left-24 -z-10 size-72 rounded-full bg-gold-400/15 blur-3xl" />

            <p className="font-caps text-xs font-semibold tracking-[0.3em] text-gold-300 uppercase">Plan your {service.category_label.toLowerCase()}</p>
            <h2 className="mt-3 font-display text-4xl leading-tight font-semibold sm:text-[2.75rem]">Let's talk about your celebration</h2>
            <span aria-hidden="true" className="mt-5 block h-px w-16 bg-linear-to-r from-gold-300 to-transparent" />
            <p className="mt-5 text-white/80">
              Tell us your date and ideas for {service.name.toLowerCase()}. We'll call you back within a day with design ideas and a clear quote.
            </p>

            {contacts.length > 0 && (
              <ul className="mt-8 space-y-5">
                {contacts.map(({ icon: Icon, label, body }) => (
                  <li key={label} className="flex gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-gold-300 ring-1 ring-gold-300/40">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="font-caps text-[0.7rem] font-semibold tracking-[0.2em] text-gold-300/90 uppercase">{label}</p>
                      <div className="mt-0.5 text-sm text-white sm:text-[0.95rem]">{body}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {stats.length > 0 && (
              <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="font-display text-3xl font-semibold text-gold-300">{stat.value}+</p>
                    <p className="mt-0.5 text-xs tracking-wide text-white/70 uppercase">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form panel */}
          <div className="px-6 py-10 sm:px-10 sm:py-12">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-gold-100 pb-6">
              <div>
                <h3 className="font-display text-3xl font-semibold text-brand-800">Send an enquiry</h3>
                <p className="mt-1 text-sm text-stone-500">Takes less than a minute. No obligation.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-700">
                <Clock className="size-3.5" aria-hidden="true" /> Reply within a day
              </span>
            </div>
            <EnquiryForm defaultEventType={service.category} serviceSlug={service.slug} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/** One section of the lower half: its tab label, and the rows or content it holds. */
interface Section {
  id: string
  tab: string
  title: string
  body: ReactNode
}

/**
 * Everything below the photo card: a tab bar that sticks under the menu and jumps to each section
 * (highlighting the one being read), the sections themselves, and the budget box alongside.
 */
function ServiceSections({ service, related }: { service: Service; related: GalleryImage[] }) {
  const photos = [
    ...(service.cover_image ? [{ src: service.cover_image, alt: service.name }] : []),
    ...service.images.map((p) => ({
      src: p.image,
      alt: p.caption || service.name,
    })),
    ...related.map((g) => ({
      src: g.image,
      alt: g.alt_text || g.caption || service.name,
    })),
  ]
  const description = service.description.split(/\n{2,}/).filter(Boolean)

  const candidates: (Section | false)[] = [
    description.length > 0 && {
      id: 'overview',
      tab: 'Overview',
      title: 'About this service',
      body: (
        <div className="space-y-4 text-lg text-stone-700">
          {description.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ),
    },
    service.highlights.length > 0 && {
      id: 'included',
      tab: "What's included",
      title: 'What this service has to offer',
      body: (
        <IconList
          items={service.highlights.map((h) => ({
            icon: keywordIcon(h, Check),
            text: h,
          }))}
        />
      ),
    },
    service.details.length > 0 && {
      id: 'details',
      tab: 'Service details',
      title: 'Service details',
      body: (
        <IconList
          items={service.details.map((line) => {
            const [label, ...rest] = line.split(':')
            const value = rest.join(':').trim()
            return {
              icon: pickIcon(label, DETAIL_ICONS, Check),
              text: value ? (
                <>
                  {label.trim()} – <span className="font-medium text-brand-800">{value}</span>
                </>
              ) : (
                line
              ),
            }
          })}
        />
      ),
    },
    service.policies.length > 0 && {
      id: 'booking',
      tab: 'Booking policies',
      title: 'Booking policies',
      body: (
        <IconList
          items={service.policies.map((t) => ({
            icon: pickIcon(t, POLICY_ICONS, ShieldCheck),
            text: t,
          }))}
        />
      ),
    },
    service.payment_terms.length > 0 && {
      id: 'payment',
      tab: 'Payment policies',
      title: 'Payment policies',
      body: (
        <IconList
          items={service.payment_terms.map((t) => ({
            icon: pickIcon(t, PAYMENT_ICONS, IndianRupee),
            text: t,
          }))}
        />
      ),
    },
    photos.length > 0 && {
      id: 'albums',
      tab: 'Albums',
      title: 'Albums',
      body: <Album photos={photos} />,
    },
  ]
  const sections = candidates.filter((section): section is Section => Boolean(section))

  // The tab bar sits just under the sticky menu, whatever height the menu is.
  const [menuHeight, setMenuHeight] = useState(64)
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const measure = () => setMenuHeight(header.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  const sectionOffset = menuHeight + 72

  // The tab of the section at the top of the screen is the active one.
  const [active, setActive] = useState(sections[0]?.id)
  const ids = sections.map((section) => section.id).join(' ')
  useEffect(() => {
    const onScroll = () => {
      let current = ids.split(' ')[0]
      for (const id of ids.split(' ')) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= sectionOffset + 40) current = id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ids, sectionOffset])

  // Keep the active tab in view on phones, where the bar scrolls sideways.
  const tabBar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tab = tabBar.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)
    const bar = tabBar.current
    if (tab && bar)
      bar.scrollTo({
        left: tab.offsetLeft - bar.clientWidth / 2 + tab.clientWidth / 2,
        behavior: 'smooth',
      })
  }, [active])

  if (sections.length === 0) return null

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <nav aria-label="Service sections" className="sticky z-30 -mx-4 bg-blush-light/95 px-4 backdrop-blur sm:mx-0 sm:px-0" style={{ top: menuHeight }}>
          <div ref={tabBar} className="flex overflow-x-auto border-b border-gold-200 [scrollbar-width:none]">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                data-tab={section.id}
                aria-current={active === section.id ? 'true' : undefined}
                className={`relative shrink-0 px-4 py-4 text-sm font-medium whitespace-nowrap transition sm:text-base ${
                  active === section.id ? 'text-brand-700' : 'text-stone-500 hover:text-brand-700'
                }`}
              >
                {section.tab}
                {active === section.id && <motion.span layoutId="service-tab" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-600" />}
              </a>
            ))}
          </div>
        </nav>

        {sections.map((section, i) => (
          <section key={section.id} id={section.id} style={{ scrollMarginTop: sectionOffset }} className={`py-10 ${i > 0 ? 'border-t border-gold-100' : ''}`}>
            <Reveal>
              <h2 className="mb-6 text-3xl font-semibold text-brand-800">{section.title}</h2>
              {section.body}
            </Reveal>
          </section>
        ))}
      </div>

      <div className="hidden lg:block">
        <aside className="sticky rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gold-300" style={{ top: menuHeight + 24 }}>
          <p className="font-display text-2xl font-semibold text-brand-800">Not sure about the budget?</p>
          <p className="mt-2 text-sm text-stone-600">Final pricing depends on venue size, design and date. Get an instant range in a minute.</p>
          <Link to="/estimate" className="mt-5 block rounded-full bg-brand-700 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-brand-800">
            Estimate my event
          </Link>
          <a href="#enquire" className="mt-2 block rounded-full px-5 py-3 text-center text-sm font-semibold text-brand-800 ring-1 ring-gold-400 hover:bg-gold-100">
            Enquire now
          </a>
        </aside>
      </div>
    </div>
  )
}

/** Rows of icon + text, like an amenities list. */
function IconList({ items }: { items: { icon: LucideIcon; text: ReactNode }[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
      {items.map(({ icon: Icon, text }, i) => (
        <li key={i} className="flex items-start gap-4 text-lg text-stone-700">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-gold-600 ring-1 ring-gold-200">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="pt-1.5">{text}</span>
        </li>
      ))}
    </ul>
  )
}

/** A photo grid; any photo opens full screen, with arrows, swipe and the keyboard to move through them. */
function Album({ photos }: { photos: { src: string; alt: string }[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const touchX = useRef<number | null>(null)
  const go = (step: number) => setOpen((i) => (i === null ? i : (i + step + photos.length) % photos.length))
  const isOpen = open !== null

  // While open: Esc closes, arrow keys move, and the page behind doesn't scroll.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {photos.map((p, i) => (
          <li key={`${p.src}-${i}`}>
            <button type="button" onClick={() => setOpen(i)} className="group block w-full overflow-hidden rounded-xl" aria-label={`Open photo ${i + 1}`}>
              <img src={p.src} alt={p.alt} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105" />
            </button>
          </li>
        ))}
      </ul>
      {/* On the page body: inside the scroll-in animation, "fixed" would be measured against that box. */}
      {createPortal(
        <AnimatePresence>
          {open !== null && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Photo viewer"
              className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(null)}
              onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (touchX.current === null) return
                const dx = e.changedTouches[0].clientX - touchX.current
                touchX.current = null
                if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
              }}
            >
              <img src={photos[open].src} alt={photos[open].alt} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
              <p className="absolute bottom-5 text-sm text-white/80">
                {open + 1} / {photos.length}
              </p>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <X className="size-6" />
              </button>
              {photos.length > 1 &&
                [
                  {
                    step: -1,
                    Icon: ChevronLeft,
                    label: 'Previous photo',
                    side: 'left-3',
                  },
                  {
                    step: 1,
                    Icon: ChevronRight,
                    label: 'Next photo',
                    side: 'right-3',
                  },
                ].map(({ step, Icon, label, side }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    onClick={(e) => {
                      e.stopPropagation()
                      go(step)
                    }}
                    className={`absolute top-1/2 ${side} grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25`}
                  >
                    <Icon className="size-6" />
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

/** Cover image first, then the service's slideshow photos. Moves on by itself, pauses while hovered, swipes on touch. */
function ServiceSlideshow({ service }: { service: Service }) {
  const photos = [...(service.cover_image ? [{ src: service.cover_image, caption: '' }] : []), ...service.images.map((p) => ({ src: p.image, caption: p.caption }))]
  if (photos.length === 0) photos.push({ src: SERVICE_HERO_PHOTO, caption: '' })

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchX = useRef<number | null>(null)
  const many = photos.length > 1
  const go = (step: number) => setIndex((i) => (i + step + photos.length) % photos.length)

  useEffect(() => {
    if (!many || paused) return
    const timer = window.setTimeout(() => go(1), SLIDE_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [index, paused, many])

  const photo = photos[index] ?? photos[0]
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-brand-900 lg:aspect-auto lg:h-full lg:min-h-[28rem]"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${service.name} photos`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (many && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
      }}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={photo.src}
          src={photo.src}
          alt={photo.caption || `${service.name} by Mitra Events — photo ${index + 1}`}
          fetchPriority={index === 0 ? 'high' : undefined}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          className="absolute inset-0 size-full object-cover"
        />
      </AnimatePresence>

      {many && (
        <>
          {[
            {
              step: -1,
              Icon: ChevronLeft,
              label: 'Previous photo',
              side: 'left-3',
            },
            {
              step: 1,
              Icon: ChevronRight,
              label: 'Next photo',
              side: 'right-3',
            },
          ].map(({ step, Icon, label, side }) => (
            <button
              key={label}
              type="button"
              onClick={() => go(step)}
              aria-label={label}
              className={`absolute top-1/2 ${side} grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55`}
            >
              <Icon className="size-5" />
            </button>
          ))}
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <div className="flex gap-2 rounded-full bg-black/45 px-3 py-2 backdrop-blur-sm">
              {photos.map((p, i) => (
                <button
                  key={p.src}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === index}
                  className={`size-2 rounded-full transition ${i === index ? 'bg-gold-300' : 'bg-white/70 hover:bg-white'}`}
                />
              ))}
            </div>
          </div>
          <span className="absolute bottom-0 left-0 bg-brand-700/90 py-1.5 pr-6 pl-4 text-sm font-semibold text-white [clip-path:polygon(0_0,calc(100%-14px)_0,100%_100%,0_100%)]">
            {index + 1} / {photos.length}
          </span>
        </>
      )}
      {photo.caption && <p className="absolute inset-x-0 top-0 bg-linear-to-b from-black/60 to-transparent px-5 pt-4 pb-8 text-sm text-white">{photo.caption}</p>}
    </div>
  )
}

/** Uses the phone's share sheet where there is one; otherwise copies the link. */
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Closing the share sheet counts as an error; nothing to do.
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-2 rounded-full bg-stone-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
    >
      <Share2 className="size-4" /> {copied ? 'Link copied' : 'Share'}
    </button>
  )
}
