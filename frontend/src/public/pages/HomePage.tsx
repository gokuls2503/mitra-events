import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Calculator, Flower2, Lightbulb, PartyPopper, PenTool } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import { Link } from 'react-router-dom'

import { galleryQuery, packagesQuery, servicesQuery, settingsQuery, testimonialsQuery } from '../api'
import { CornerSwoosh, EventTypesLine, Logo, LotusDivider, LotusMark } from '../components/Brand'
import { PackageCard, ServiceCard, TestimonialCard } from '../components/Cards'
import { CountUp, Reveal } from '../components/Reveal'
import { SectionHeading } from '../components/SectionHeading'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

const PROCESS = [
  { icon: Lightbulb, title: 'Consult', text: 'We listen to your ideas, traditions, budget and venue.' },
  { icon: PenTool, title: 'Design', text: 'A decor concept with colours, florals, lighting and layout.' },
  { icon: Flower2, title: 'Decorate', text: 'Our team sets up on time, down to the last petal.' },
  { icon: PartyPopper, title: 'Celebrate', text: 'You enjoy the day — we handle everything on site.' },
]

const heroText: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }),
}

export default function HomePage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: services } = useQuery(servicesQuery)
  const { data: packages } = useQuery(packagesQuery)
  const { data: gallery } = useQuery(galleryQuery)
  const { data: testimonials } = useQuery(testimonialsQuery)

  // Featured first, topped up with the rest so the 3-column grid has full rows.
  const featuredServices = services
    ? [...services.filter((s) => s.is_featured), ...services.filter((s) => !s.is_featured)].slice(0, services.length >= 6 ? 6 : 3)
    : []
  // One large tile spanning two rows + four small ones fills a 3×2 grid exactly.
  const featuredGallery = gallery?.filter((g) => g.is_featured).slice(0, 5) ?? []
  const featuredTestimonials = testimonials?.filter((t) => t.is_featured).slice(0, 3) ?? []
  const title = pageTitle(null, site)

  return (
    <>
      <Seo
        title={title}
        description={
          site?.hero_subtitle ||
          'Wedding, birthday, corporate and traditional event decorations and management in Coimbatore.'
        }
        path="/"
        image={site?.hero_image}
      />

      {/* Hero — light, after the visiting card: ivory, purple and gold swooshes, lotus. */}
      <section className="relative isolate overflow-hidden bg-linear-to-br from-ivory via-ivory to-cream">
        <CornerSwoosh corner="top-left" size="sm" className="-z-10" />
        <CornerSwoosh corner="bottom-right" className="-z-10" />
        <LotusMark tone="gold" className="absolute top-1/2 -right-24 -z-10 h-auto w-[42rem] max-w-none -translate-y-1/2 opacity-[0.06]" />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:grid-cols-[1.15fr_1fr]">
          <div className="text-center lg:text-left">
            <motion.p
              custom={0}
              variants={heroText}
              initial="hidden"
              animate="show"
              className="font-caps text-xs font-semibold tracking-[0.35em] text-gold-700 uppercase sm:text-sm"
            >
              Events beyond expectation
            </motion.p>
            <motion.h1
              custom={1}
              variants={heroText}
              initial="hidden"
              animate="show"
              className="mt-4 text-5xl leading-[1.05] font-semibold text-brand-800 sm:text-7xl"
            >
              {site?.hero_title || 'Celebrations, beautifully decorated'}
            </motion.h1>
            <motion.div custom={2} variants={heroText} initial="hidden" animate="show">
              <LotusDivider className="mt-6 lg:justify-start" />
              {site?.hero_subtitle && <p className="mt-5 text-lg text-stone-600">{site.hero_subtitle}</p>}
              <EventTypesLine className="mt-6 justify-center lg:justify-start" />
            </motion.div>
            <motion.div
              custom={3}
              variants={heroText}
              initial="hidden"
              animate="show"
              className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start"
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

          {/* Photo in an arched, gold-edged frame; the logo stands in when there's no photo. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="overflow-hidden rounded-t-full rounded-b-3xl bg-white p-2 shadow-2xl ring-1 ring-gold-300">
              <div className="aspect-[4/5] overflow-hidden rounded-t-full rounded-b-2xl bg-cream">
                {site?.hero_image ? (
                  <img src={site.hero_image} alt="" fetchPriority="high" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center p-8">
                    <Logo size="lg" />
                  </div>
                )}
              </div>
            </div>
            <span className="absolute -bottom-6 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-ivory shadow-md ring-1 ring-gold-300">
              <LotusMark className="h-7 w-auto" />
            </span>
          </motion.div>
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredServices.map((s, i) => (
            <Reveal key={s.slug} delay={(i % 3) * 0.08}>
              <ServiceCard service={s} />
            </Reveal>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link to="/services" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            View all services <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Process */}
      <section className="border-y border-gold-200 bg-cream py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="How we work" title="From idea to celebration" />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 0.1} className="rounded-2xl bg-ivory p-6 shadow-sm ring-1 ring-gold-200">
                <span className="grid size-12 place-items-center rounded-full bg-white text-gold-600 ring-1 ring-gold-400">
                  <p.icon className="size-6" />
                </span>
                <p className="mt-4 font-caps text-xs font-semibold tracking-[0.2em] text-gold-700">STEP {i + 1}</p>
                <h3 className="mt-1 text-2xl font-semibold text-brand-800">{p.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{p.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Gallery preview */}
      {featuredGallery.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <SectionHeading eyebrow="Our work" title="Moments we've decorated" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {featuredGallery.map((g, i) => (
              <Reveal key={g.id} delay={(i % 3) * 0.08} className={i === 0 ? 'md:row-span-2' : ''}>
                <Link to="/gallery" className="group block h-full overflow-hidden rounded-2xl">
                  <img
                    src={g.image}
                    alt={g.alt_text || g.caption}
                    loading="lazy"
                    decoding="async"
                    className="size-full min-h-40 object-cover transition duration-700 group-hover:scale-105"
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

      {/* Estimator teaser */}
      <section className="px-4 sm:px-6">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-3xl bg-linear-to-br from-gold-300 to-gold-500 px-6 py-14 text-center sm:px-12 lg:flex-row lg:text-left">
          <div className="flex-1">
            <h2 className="text-4xl font-semibold text-brand-900 sm:text-5xl">What will your event cost?</h2>
            <p className="mt-3 text-brand-900/80">
              Pick your event, guest count and decor style — get an instant price range in under a minute.
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

      {/* Packages */}
      {packages && packages.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <SectionHeading eyebrow="Packages" title="Simple starting points" intro="Every package can be customised to your venue and theme." />
          <div className="grid items-stretch gap-8 md:grid-cols-3">
            {packages.slice(0, 3).map((p, i) => (
              <Reveal key={p.slug} delay={i * 0.1}>
                <PackageCard pkg={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {featuredTestimonials.length > 0 && (
        <section className="bg-brand-50 py-24">
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
    </>
  )
}
