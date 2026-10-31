import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Heart, Sparkles, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'

import { faqsQuery, settingsQuery, type Faq } from '../api'
import { heroImage, PageHero } from '../components/PageHero'
import { PlanCta } from '../components/PlanCta'
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

// "Who we are" slideshow. The two placeholder slides wait for real Mitra photos.
const SLIDES = [
  {
    image: '/images/about/stage-close.jpg',
    title: 'Stages that feel like you',
    text: 'Glowing petal backdrops, chandeliers and fresh flower borders, designed around the couple.',
  },
  {
    image: '/images/about/hall-wide.jpg',
    title: 'Planned down to the last chair',
    text: 'Seating, lighting and stage set out to plan, so the hall is ready long before guests arrive.',
  },
  {
    image: '/images/about/stage-night.jpg',
    title: 'Lit for the evening',
    text: 'Warm lighting that brings out every flower and photographs beautifully after dark.',
  },
  {
    image: '/images/about/placeholder-reception.jpg',
    title: 'Receptions to remember',
    text: 'LED backdrops and grand stages for the evening your families celebrate together.',
  },
  {
    image: '/images/about/placeholder-engagement.jpg',
    title: 'Every ritual, honoured',
    text: 'Gold and ivory decor for engagements and traditional functions, true to your customs.',
  },
]
const SLIDE_SECONDS = 5

export default function AboutPage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: faqs } = useQuery(faqsQuery)
  const title = pageTitle('About us', site)

  return (
    <>
      <Seo
        title={title}
        description={`About ${site?.business_name ?? 'Mitra Events Management'} — event decorators and planners in ${site?.city ?? 'Coimbatore'}.`}
        path="/about"
        image={site?.about_image}
      />
      <PageHero eyebrow="About us" title={site?.about_title || 'Our story'} image={heroImage(site, 'about')} />

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <AboutCarousel />
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

      <section className="border-y border-gold-200 bg-blush-light py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="What we value" title="Why families choose Mitra" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.3} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100">
                <v.icon className="size-8 text-gold-500" />
                <h3 className="mt-4 text-2xl font-semibold text-brand-800">{v.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{v.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {faqs && faqs.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Frequently asked questions" />
          <FaqAccordion faqs={faqs} />
        </section>
      )}

      <PlanCta />
    </>
  )
}

/** Five photos with a caption each; moves on by itself, pauses while hovered. */
function AboutCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const go = (step: number) => setIndex((i) => (i + step + SLIDES.length) % SLIDES.length)

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => go(1), SLIDE_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [index, paused])

  const slide = SLIDES[index]
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-brand-900 shadow-xl"
      role="region"
      aria-roledescription="carousel"
      aria-label="Our work"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={slide.image}
          src={slide.image}
          alt={slide.title}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 size-full object-cover"
        />
      </AnimatePresence>
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/40 to-transparent px-6 pt-16 pb-12" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div key={slide.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
            <p className="font-display text-2xl font-semibold text-white">{slide.title}</p>
            <p className="mt-1 text-sm text-white/90">{slide.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.image}
            onClick={() => setIndex(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-gold-300' : 'w-1.5 bg-white/60 hover:bg-white'}`}
          />
        ))}
      </div>
      {[
        { step: -1, Icon: ChevronLeft, label: 'Previous photo', side: 'left-3' },
        { step: 1, Icon: ChevronRight, label: 'Next photo', side: 'right-3' },
      ].map(({ step, Icon, label, side }) => (
        <button
          key={label}
          onClick={() => go(step)}
          aria-label={label}
          className={`absolute top-1/2 ${side} grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-brand-800 shadow transition hover:bg-white`}
        >
          <Icon className="size-5" />
        </button>
      ))}
    </div>
  )
}

/** One answer open at a time; the first starts open. Questions come from Website content → FAQs. */
function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const [open, setOpen] = useState<number | null>(faqs[0]?.id ?? null)
  const baseId = useId()

  return (
    <ul className="space-y-3">
      {faqs.map((f, i) => {
        const isOpen = open === f.id
        const panelId = `${baseId}-faq-${f.id}`
        return (
          <Reveal as="li" key={f.id} delay={i * 0.08} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gold-200">
            <h3>
              <button
                onClick={() => setOpen(isOpen ? null : f.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center gap-4 px-6 py-5 text-left font-display text-xl font-semibold text-brand-800 transition hover:text-brand-600"
              >
                <span className="flex-1">{f.question}</span>
                <ChevronDown className={`size-5 shrink-0 text-gold-600 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="border-t border-gold-100 px-6 pt-4 pb-6 whitespace-pre-line text-stone-600">{f.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </Reveal>
        )
      })}
    </ul>
  )
}
