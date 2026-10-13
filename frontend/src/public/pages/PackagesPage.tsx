import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { packagesQuery, settingsQuery } from '../api'
import { PackageCard } from '../components/Cards'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

export default function PackagesPage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: packages } = useQuery(packagesQuery)
  const title = pageTitle('Packages & pricing', site)

  return (
    <>
      <Seo
        title={title}
        description={`Event decoration packages and starting prices from ${site?.business_name ?? 'Mitra Events'}, ${site?.city ?? 'Coimbatore'}.`}
        path="/packages"
      />
      <PageHero
        eyebrow="Packages"
        title="Packages & pricing"
        intro="Transparent starting points. Every package is tailored to your venue, theme and guest count."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid items-stretch gap-8 pt-4 md:grid-cols-2 lg:grid-cols-3">
          {packages?.map((p, i) => (
            <Reveal key={p.slug} delay={(i % 3) * 0.1}>
              <PackageCard pkg={p} />
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-16 rounded-2xl bg-brand-50 p-8 text-center ring-1 ring-brand-100">
          <h2 className="text-3xl font-semibold text-brand-800">Need something different?</h2>
          <p className="mx-auto mt-2 max-w-xl text-stone-600">
            Use our estimator to price a custom event, or tell us what you have in mind.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/estimate" className="rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800">
              Open the estimator
            </Link>
            <Link to="/contact" className="rounded-full px-6 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-300 hover:bg-white">
              Contact us
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  )
}
