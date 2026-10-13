import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { settingsQuery, testimonialsQuery } from '../api'
import { TestimonialCard } from '../components/Cards'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

export default function TestimonialsPage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: testimonials } = useQuery(testimonialsQuery)
  const title = pageTitle('Testimonials', site)

  return (
    <>
      <Seo
        title={title}
        description={`Reviews from families and businesses who celebrated with ${site?.business_name ?? 'Mitra Events'}.`}
        path="/testimonials"
      />
      <PageHero eyebrow="Testimonials" title="Kind words from our clients" />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="columns-1 gap-6 md:columns-2 lg:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
          {testimonials?.map((t, i) => (
            <Reveal key={t.id} delay={(i % 3) * 0.08}>
              <TestimonialCard t={t} />
            </Reveal>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/contact" className="inline-block rounded-full bg-brand-700 px-8 py-4 font-semibold text-white hover:bg-brand-800">
            Plan your event with us
          </Link>
        </div>
      </section>
    </>
  )
}
