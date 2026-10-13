import { useQuery } from '@tanstack/react-query'
import { Clock, Heart, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import { settingsQuery } from '../api'
import { PageHero } from '../components/PageHero'
import { CountUp, Reveal } from '../components/Reveal'
import { SectionHeading } from '../components/SectionHeading'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

const VALUES = [
  { icon: Heart, title: 'Personal', text: 'Every design starts with your story, family traditions and taste.' },
  { icon: Sparkles, title: 'Detailed', text: 'Fresh flowers, careful finishing and lighting that photographs beautifully.' },
  { icon: Clock, title: 'On time', text: 'Setups completed before guests arrive — every single time.' },
  { icon: Users, title: 'One team', text: 'Decor, lighting, sound and coordination handled by one accountable team.' },
]

export default function AboutPage() {
  const { data: site } = useQuery(settingsQuery)
  const title = pageTitle('About us', site)

  return (
    <>
      <Seo
        title={title}
        description={`About ${site?.business_name ?? 'Mitra Events Management'} — event decorators and planners in ${site?.city ?? 'Coimbatore'}.`}
        path="/about"
        image={site?.about_image}
      />
      <PageHero eyebrow="About us" title={site?.about_title || 'Our story'} />

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal>
          {site?.about_image && (
            <img src={site.about_image} alt="The Mitra team at work" className="aspect-[6/7] w-full rounded-3xl object-cover shadow-xl" />
          )}
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-xs font-semibold tracking-[0.3em] text-gold-600 uppercase">Who we are</p>
          <h2 className="mt-2 text-4xl font-semibold text-brand-800 sm:text-5xl">{site?.business_name}</h2>
          <div className="mt-6 space-y-4 text-stone-700">
            {(site?.about_body ?? '').split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          {site && (
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-brand-100 pt-6">
              {[
                { v: site.stat_events, l: 'Events' },
                { v: site.stat_years, l: 'Years' },
                { v: site.stat_clients, l: 'Families' },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="text-xs text-stone-500 uppercase">{s.l}</dt>
                  <dd className="font-display text-4xl font-semibold text-brand-700">
                    <CountUp value={s.v} suffix="+" />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Reveal>
      </section>

      <section className="bg-brand-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="What we value" title="Why families choose Mitra" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.08} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100">
                <v.icon className="size-8 text-gold-500" />
                <h3 className="mt-4 text-2xl font-semibold text-brand-800">{v.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{v.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <SectionHeading title="Let's plan something beautiful" />
        <Link to="/contact" className="inline-block rounded-full bg-brand-700 px-8 py-4 font-semibold text-white hover:bg-brand-800">
          Talk to us
        </Link>
      </section>
    </>
  )
}
