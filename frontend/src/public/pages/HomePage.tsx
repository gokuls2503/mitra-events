import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Calculator } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import { Link } from 'react-router-dom'

import { galleryQuery, servicesQuery, settingsQuery, testimonialsQuery } from '../api'
import { EventTypesLine, LotusDivider } from '../components/Brand'
import { ServicePanel, TestimonialCard } from '../components/Cards'
import { useHeroNav } from '../components/HeroNav'
import { HowWeWork } from '../components/HowWeWork'
import { heroImage } from '../components/PageHero'
import { CountUp, Reveal } from '../components/Reveal'
import { SectionHeading } from '../components/SectionHeading'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

const heroText: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }),
}

const HOME_SERVICE_CATEGORIES = ['WEDDING', 'RECEPTION', 'BIRTHDAY']

export default function HomePage() {
  useHeroNav()
  const { data: site } = useQuery(settingsQuery)
  const { data: services } = useQuery(servicesQuery)
  const { data: gallery } = useQuery(galleryQuery)
  const { data: testimonials } = useQuery(testimonialsQuery)

  // Wedding, reception and birthday, in that order; the rest are one click away on Services.
  const featuredServices = HOME_SERVICE_CATEGORIES.flatMap((category) => services?.find((s) => s.category === category) ?? [])
  // Three equal tiles, one row.
  const featuredGallery = gallery?.filter((g) => g.is_featured).slice(0, 3) ?? []
  const featuredTestimonials = testimonials?.filter((t) => t.is_featured).slice(0, 3) ?? []
  const title = pageTitle(null, site)

  return (
    <div className="bg-blush-light">
      <Seo
        title={title}
        description={
          site?.hero_subtitle ||
          'Wedding, birthday, corporate and traditional event decorations and management in Coimbatore.'
        }
        path="/"
        image={site?.hero_image}
      />

      {/* Hero — the home banner photo, full width; the transparent navbar sits on top of it. */}
      <section className="relative isolate overflow-hidden bg-brand-900">
        {/* A light dark shade keeps the photo sharp and the white text readable. */}
        {site && <img src={heroImage(site, 'home')} alt="" fetchPriority="high" className="absolute inset-0 -z-20 size-full object-cover" />}
        <div className="absolute inset-0 -z-20 bg-linear-to-b from-black/55 via-black/30 to-black/50" />
        <div className="mx-auto flex min-h-[88vh] w-full max-w-4xl items-center justify-center px-4 pt-28 pb-24 sm:px-6 sm:pt-32">
          <div className="text-center">
            <motion.p
              custom={0}
              variants={heroText}
              initial="hidden"
              animate="show"
              className="font-caps text-xs font-bold tracking-[0.35em] text-gold-300 uppercase [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] sm:text-sm"
            >
              Events beyond expectation
            </motion.p>
            <motion.h1
              custom={1}
              variants={heroText}
              initial="hidden"
              animate="show"
              className="mt-4 text-5xl leading-[1.05] font-bold text-white drop-shadow-lg sm:text-7xl"
            >
              {site?.hero_title || 'Celebrations, beautifully decorated'}
            </motion.h1>
            <motion.div custom={2} variants={heroText} initial="hidden" animate="show">
              <LotusDivider className="mt-12 [&>img]:h-5 [&>img]:opacity-100 [&>img]:saturate-100 [&>span]:h-[3px] [&>span]:w-24 [&>span]:rounded-full [&>span]:from-gold-300/50 [&>span]:to-gold-300 sm:[&>span]:w-32" />
              {site?.hero_subtitle && <p className="mt-12 text-lg leading-8 whitespace-pre-line text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]">{site.hero_subtitle}</p>}
              <EventTypesLine className="mt-8 justify-center font-bold text-white! [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] [&_svg]:text-gold-300!" />
            </motion.div>
            <motion.div
              custom={3}
              variants={heroText}
              initial="hidden"
              animate="show"
              className="mt-9 flex flex-wrap justify-center gap-3"
            >
              <Link
                to="/estimate"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-700 px-7 font-semibold text-white shadow-lg shadow-brand-700/20 transition hover:bg-brand-800"
              >
                <Calculator className="size-5" /> Estimate your event
              </Link>
              <Link
                to="/gallery"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/70 px-7 font-semibold text-brand-800 ring-1 ring-gold-400 transition hover:bg-gold-100"
              >
                See our work <ArrowRight className="size-4" />
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {site && (site.stat_events || site.stat_years || site.stat_clients) ? (
        <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-4">
          <div className="grid grid-cols-3 divide-x divide-gold-200 rounded-2xl bg-white py-7 shadow-xl ring-1 ring-gold-200">
            {[
              { value: site.stat_events, label: 'Events decorated' },
              { value: site.stat_years, label: 'Years of experience' },
              { value: site.stat_clients, label: 'Happy families' },
            ].map((s) => (
              <div key={s.label} className="px-2 text-center">
                <p className="font-display text-4xl font-semibold text-brand-700 sm:text-5xl">
                  <CountUp value={s.value} suffix="+" />
                </p>
                <p className="mt-1 text-xs text-stone-500 sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Services */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="What we do"
          title="Decor for every celebration"
          intro="From intimate home functions to grand weddings, we design and execute decor that feels personal."
        />
        {/* From tablet size up, each panel sticks a little lower than the one before, so the next slides over it
            and the earlier ones stay peeking out above, like a fanned deck.
            Phones get a plain list: a panel is taller than the screen there. */}
        <ol className="space-y-10">
          {featuredServices.map((s, i) => (
            <li
              key={s.slug}
              className="md:sticky"
              // The bottom margin offsets each panel's stopping step, so all three let go together
              // instead of the later ones sliding over the first.
              style={{
                top: `calc(6rem + ${i * 4.5}rem)`,
                zIndex: i + 1,
                marginBottom: `${(featuredServices.length - 1 - i) * 4.5}rem`,
              }}
            >
              <ServicePanel service={s} flip={i % 2 === 1} />
            </li>
          ))}
          {/* Scroll room for the last panel to settle into its step before the stack moves on. */}
          <li aria-hidden="true" className="hidden h-48 md:block" />
        </ol>
        <div className="mt-12 text-center">
          <Link to="/services" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            View more <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <HowWeWork />

      {/* Gallery preview */}
      {featuredGallery.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <SectionHeading eyebrow="Our work" title="Moments we've decorated" />
          <div className="grid gap-4 sm:grid-cols-3">
            {featuredGallery.map((g, i) => (
              <Reveal key={g.id} delay={i * 0.08}>
                <Link to="/gallery" className="group block aspect-[4/5] overflow-hidden rounded-2xl">
                  <img
                    src={g.image}
                    alt={g.alt_text || g.caption}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition duration-700 group-hover:scale-105"
                  />
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/gallery" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              Open the full gallery <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {featuredTestimonials.length > 0 && (
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading eyebrow="Kind words" title="What our clients say" />
            <div className="grid gap-6 md:grid-cols-3">
              {featuredTestimonials.map((t, i) => (
                <Reveal key={t.id} delay={i * 0.1}>
                  <TestimonialCard t={t} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
        <SectionHeading
          eyebrow="Let's begin"
          title="Tell us about your celebration"
          intro="Share your date and ideas — we'll call you back with design options and a quote."
        />
        <Reveal>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-8 py-4 font-semibold text-white shadow-lg transition hover:bg-brand-800"
          >
            Send an enquiry <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </section>
    </div>
  )
}
