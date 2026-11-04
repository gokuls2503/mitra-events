import { useQuery } from '@tanstack/react-query'
import { Calculator } from 'lucide-react'
import { Link } from 'react-router-dom'

import { servicesQuery, settingsQuery } from '../api'
import { ServicePanel } from '../components/Cards'
import { heroImage, PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

export default function ServicesPage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: services } = useQuery(servicesQuery)
  const title = pageTitle('Services', site)

  return (
    <>
      <Seo
        title={title}
        description={`Wedding, reception, birthday, baby shower, housewarming and corporate event decoration services in ${site?.city ?? 'Coimbatore'}.`}
        path="/services"
      />
      <PageHero
        eyebrow="Services"
        title="Decor for every occasion"
        intro="Choose a service to see what's included, or contact us for something completely custom."
        image={heroImage(site, 'services')}
      />
      {/* Photo and text side by side, swapping sides on every other service; each half slides in from its side. */}
      <section className="mx-auto max-w-5xl overflow-x-clip px-4 py-20 sm:px-6">
        <ul className="space-y-8">
          {services?.map((s, i) => (
            <li key={s.slug}>
              <ServicePanel service={s} flip={i % 2 === 1} compact slideIn />
            </li>
          ))}
        </ul>
      </section>
      {/* Estimator teaser */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <Reveal className="flex flex-col items-center gap-6 rounded-3xl bg-linear-to-br from-gold-300 to-gold-500 px-6 py-14 text-center sm:px-12 lg:flex-row lg:text-left">
          <div className="flex-1">
            <h2 className="text-4xl font-semibold text-brand-900 sm:text-5xl">What will your event cost?</h2>
            <p className="mt-3 text-brand-900/80">
              Pick your event and stage size — get an instant price range in under a minute.
            </p>
          </div>
          <Link
            to="/estimate"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-800 px-7 py-3.5 font-semibold text-white shadow-lg transition hover:bg-brand-900"
          >
            <Calculator className="size-5" /> Try the estimator
          </Link>
        </Reveal>
      </section>

    </>
  )
}
