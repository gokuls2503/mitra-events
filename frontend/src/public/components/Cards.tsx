import clsx from 'clsx'
import { ArrowRight, Check, Quote, Star } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatINR } from '@/shared/format'

import type { Package, Service, Testimonial } from '../api'

export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      to={`/services/${service.slug}`}
      className="group block h-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-brand-100 transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="aspect-[3/2] overflow-hidden bg-brand-100">
        {service.cover_image && (
          <img
            src={service.cover_image}
            alt={service.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition duration-700 group-hover:scale-105"
          />
        )}
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold tracking-widest text-gold-600 uppercase">{service.category_label}</p>
        <h3 className="mt-1 text-2xl font-semibold text-brand-800">{service.name}</h3>
        <p className="mt-2 text-sm text-stone-600">{service.short_description}</p>
        <div className="mt-4 flex items-center justify-between text-sm">
          {service.starting_price ? (
            <span className="text-stone-500">
              From <strong className="text-brand-700">{formatINR(service.starting_price)}</strong>
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-medium text-brand-700">
            Explore <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  )
}

export function PackageCard({ pkg }: { pkg: Package }) {
  return (
    <div
      className={clsx(
        'relative flex h-full flex-col rounded-2xl p-7 transition hover:-translate-y-1',
        pkg.is_popular ? 'bg-white shadow-xl ring-2 ring-gold-400' : 'bg-white shadow-sm ring-1 ring-brand-100 hover:shadow-xl',
      )}
    >
      {pkg.is_popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-700 px-3 py-1 font-caps text-xs font-semibold tracking-wider text-white">
          Most popular
        </span>
      )}
      <p className="font-caps text-xs font-semibold tracking-[0.2em] text-gold-700 uppercase">
        {pkg.event_type_label || 'Package'}
      </p>
      <h3 className="mt-1 text-3xl font-semibold text-brand-800">{pkg.name}</h3>
      {pkg.tagline && <p className="mt-1 text-sm text-stone-600">{pkg.tagline}</p>}
      <p className="mt-5">
        {pkg.price_note && (
          <span className="block text-xs text-stone-500 uppercase">
            {pkg.price_note}
          </span>
        )}
        <span className="font-display text-4xl font-semibold text-brand-800">{formatINR(pkg.price)}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {pkg.inclusions.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-gold-600" />
            {item}
          </li>
        ))}
      </ul>
      <Link
        to={`/contact?package=${pkg.slug}`}
        className={clsx(
          'mt-7 rounded-full px-5 py-3 text-center text-sm font-semibold transition',
          pkg.is_popular ? 'bg-brand-700 text-white hover:bg-brand-800' : 'bg-white text-brand-800 ring-1 ring-brand-300 hover:bg-brand-50',
        )}
      >
        Enquire about {pkg.name}
      </Link>
    </div>
  )
}

export function TestimonialCard({ t }: { t: Testimonial }) {
  const initials = t.client_name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
  return (
    <figure className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100">
      <Quote className="size-8 text-gold-400" aria-hidden />
      <div className="mt-2 flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={clsx('size-4', i < t.rating ? 'fill-gold-400 text-gold-400' : 'text-stone-300')} />
        ))}
      </div>
      <blockquote className="mt-3 flex-1 text-stone-700">“{t.quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        {t.photo ? (
          <img src={t.photo} alt="" className="size-11 rounded-full object-cover" loading="lazy" />
        ) : (
          <span className="grid size-11 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">{initials}</span>
        )}
        <span>
          <span className="block font-semibold text-brand-800">{t.client_name}</span>
          <span className="block text-xs text-stone-500">
            {[t.event_type_label, t.event_location].filter(Boolean).join(' · ')}
          </span>
        </span>
      </figcaption>
    </figure>
  )
}
