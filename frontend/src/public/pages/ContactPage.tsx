import { useQuery } from '@tanstack/react-query'
import { Clock, Mail, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import { directionsLink, mapsLink, telLink, waLink } from '@/shared/format'

import { packagesQuery, servicesQuery, settingsQuery } from '../api'
import { EnquiryForm } from '../components/LazyEnquiryForm'
import { heroImage, heroPosition, PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

export default function ContactPage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: packages } = useQuery(packagesQuery)
  const { data: services } = useQuery(servicesQuery)
  const [params] = useSearchParams()
  const title = pageTitle('Contact us', site)

  const pkg = packages?.find((p) => p.slug === params.get('package'))
  const service = services?.find((s) => s.slug === params.get('service'))

  return (
    <>
      <Seo
        title={title}
        description={`Call, WhatsApp or send an enquiry to ${site?.business_name ?? 'Mitra Events'} in ${site?.city ?? 'Coimbatore'}.`}
        path="/contact"
      />
      <PageHero eyebrow="Contact" title="Let's create something" accent="Memorable" image={heroImage(site, 'contact')} position={heroPosition(site, 'contact')} />

      {/* Two equal columns; the contact cards stretch so the left side ends level with the form. */}
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <Reveal className="flex flex-col gap-4">
          {site?.phone && (
            <ContactItem icon={<Phone />} label="Call us">
              <span className="flex flex-wrap items-center gap-x-3">
                {[site.phone, site.phone_2].filter(Boolean).map((p, i) => (
                  <Fragment key={p}>
                    {i > 0 && (
                      <span aria-hidden="true" className="text-gold-400">
                        |
                      </span>
                    )}
                    <a href={telLink(p)} className="inline-flex min-h-11 items-center hover:underline tabular-nums">
                      {p}
                    </a>
                  </Fragment>
                ))}
              </span>
            </ContactItem>
          )}
          {site?.whatsapp && (
            <ContactItem icon={<MessageCircle />} label="WhatsApp">
              <a href={waLink(site.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center hover:underline">
                Chat with us
              </a>
            </ContactItem>
          )}
          {site?.email && (
            <ContactItem icon={<Mail />} label="Email">
              <a href={`mailto:${site.email}`} className="inline-flex min-h-11 items-center break-all hover:underline">
                {site.email}
              </a>
            </ContactItem>
          )}
          {site?.address && (
            <ContactItem icon={<MapPin />} label="Visit us">
              <a href={mapsLink(site.address)} target="_blank" rel="noopener noreferrer" className="block py-2 whitespace-pre-line hover:underline">
                {site.address}
              </a>
              <a
                href={directionsLink(site.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
              >
                <Navigation className="size-4" /> Get directions
              </a>
            </ContactItem>
          )}
          {site?.business_hours && (
            <ContactItem icon={<Clock />} label="Hours">
              {site.business_hours}
            </ContactItem>
          )}
        </Reveal>

        <Reveal delay={0.1} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100 sm:p-8">
          <h2 className="text-4xl font-semibold text-brand-800">Send an enquiry</h2>
          {(pkg || service) && (
            <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Enquiring about: <strong>{pkg?.name ?? service?.name}</strong>
            </p>
          )}
          <p className="mt-2 mb-6 text-stone-600">We usually respond within a few hours.</p>
          <EnquiryForm
            key={`${pkg?.slug}-${service?.slug}`}
            packageSlug={pkg?.slug}
            serviceSlug={service?.slug}
            defaultEventType={pkg?.event_type || service?.category || ''}
          />
        </Reveal>
      </section>

      {site?.map_embed_url && (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <iframe
            title="Map"
            src={site.map_embed_url}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-80 w-full rounded-2xl border-0 shadow-sm ring-1 ring-brand-100"
          />
        </section>
      )}
    </>
  )
}

function ContactItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-brand-100 lg:flex-1">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ivory text-gold-600 ring-1 ring-gold-400 [&>svg]:size-5">{icon}</span>
      <div>
        <p className="font-caps text-xs font-semibold tracking-[0.2em] text-gold-700 uppercase">{label}</p>
        <div className="mt-0.5 font-medium text-brand-800">{children}</div>
      </div>
    </div>
  )
}
