import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { formatINR } from '@/shared/format'

import { galleryQuery, serviceQuery, settingsQuery } from '../api'
import { EnquiryForm } from '../components/LazyEnquiryForm'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { SITE_URL, pageTitle } from '../head'
import { Seo } from '../Seo'
import NotFoundPage from './NotFoundPage'

export default function ServiceDetailPage() {
  const { slug = '' } = useParams()
  const { data: site } = useQuery(settingsQuery)
  const { data: service, isError, isLoading } = useQuery(serviceQuery(slug))
  const { data: gallery } = useQuery(galleryQuery)
  const title = pageTitle(service?.seo_title || service?.name || null, site)

  if (isError) return <NotFoundPage />
  if (isLoading || !service) return <div className="min-h-[60vh]" />

  const related = gallery?.filter((g) => g.category === service.category).slice(0, 6) ?? []

  return (
    <>
      <Seo
        title={title}
        description={service.seo_description || service.short_description}
        path={`/services/${service.slug}`}
        image={service.cover_image}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: service.name,
            description: service.short_description,
            serviceType: service.category_label,
            areaServed: site?.city ?? 'Coimbatore',
            provider: { '@id': `${SITE_URL}/#business` },
            ...(service.starting_price && {
              offers: { '@type': 'Offer', priceCurrency: 'INR', price: service.starting_price },
            }),
          },
        ]}
      />
      <PageHero eyebrow={service.category_label} title={service.name} intro={service.short_description} />

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_360px]">
        <Reveal>
          <div className="space-y-4 text-lg text-stone-700">
            {service.description.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {service.highlights.length > 0 && (
            <>
              <h2 className="mt-10 text-3xl font-semibold text-brand-800">What's included</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {service.highlights.map((h) => (
                  <li key={h} className="flex gap-3 rounded-xl bg-white p-4 ring-1 ring-brand-100">
                    <Check className="mt-0.5 size-5 shrink-0 text-brand-500" />
                    {h}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Reveal>
        <Reveal delay={0.1}>
          <aside className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gold-300 lg:sticky lg:top-24">
            {service.starting_price && (
              <p>
                <span className="block font-caps text-xs font-semibold tracking-[0.2em] text-gold-700 uppercase">Starting from</span>
                <span className="font-display text-4xl font-semibold text-brand-800">{formatINR(service.starting_price)}</span>
              </p>
            )}
            <p className="mt-3 text-sm text-stone-600">Final pricing depends on venue size, design and date.</p>
            <Link to="/estimate" className="mt-5 block rounded-full bg-brand-700 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-brand-800">
              Estimate my event
            </Link>
            <a href="#enquire" className="mt-2 block rounded-full px-5 py-3 text-center text-sm font-semibold text-brand-800 ring-1 ring-gold-400 hover:bg-gold-100">
              Enquire now
            </a>
          </aside>
        </Reveal>
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <h2 className="mb-6 text-3xl font-semibold text-brand-800">Recent {service.category_label.toLowerCase()} work</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {related.map((g) => (
              <img key={g.id} src={g.image} alt={g.alt_text || g.caption} loading="lazy" className="aspect-[3/2] w-full rounded-xl object-cover" />
            ))}
          </div>
        </section>
      )}

      <section id="enquire" className="scroll-mt-24 bg-brand-50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-4xl font-semibold text-brand-800">Enquire about {service.name.toLowerCase()}</h2>
          <p className="mt-2 mb-8 text-stone-600">Share a few details and we'll get back to you within a day.</p>
          <EnquiryForm defaultEventType={service.category} serviceSlug={service.slug} />
        </div>
      </section>
    </>
  )
}
