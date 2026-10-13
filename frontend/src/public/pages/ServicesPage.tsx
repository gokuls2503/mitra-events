import { useQuery } from '@tanstack/react-query'

import { servicesQuery, settingsQuery } from '../api'
import { ServiceCard } from '../components/Cards'
import { PageHero } from '../components/PageHero'
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
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services?.map((s, i) => (
            <Reveal key={s.slug} delay={(i % 3) * 0.08}>
              <ServiceCard service={s} />
            </Reveal>
          ))}
        </div>
      </section>
    </>
  )
}
