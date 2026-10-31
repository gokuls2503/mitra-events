import { ArrowRight, Calculator } from 'lucide-react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Closing call to action: petals drift down a soft blush card, a gold rose draws itself and sways,
 * and the celebration name cycles in gold script ("Let's plan your wedding / reception / …").
 */

const OCCASIONS = ['wedding', 'reception', 'engagement', 'birthday', 'housewarming', 'celebration']
const WORD_SECONDS = 2.2

// Spread across the card; sizes, speeds and starts vary so the fall never looks in step.
const PETALS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 5) % 100}%`,
  size: 10 + ((i * 7) % 12),
  duration: 9 + ((i * 5) % 7),
  delay: -((i * 1.3) % 9),
  drift: i % 2 ? 30 : -30,
  color: ['#f0a6d6', '#e7cb86', '#f6dbe7', '#d8b05b'][i % 4],
}))

// A long-stemmed rose, drawn bloom first: spiral heart, cup, outer petals, then stem and leaves.
const ROSE = [
  'M50 34C44 32 42 26 46 22C50 18 56 22 54 26C52 29 48 27 49 25',
  'M36 30C36 18 44 12 50 12C56 12 64 18 64 30',
  'M50 58C30 58 22 42 28 28C34 34 42 36 50 34C58 36 66 34 72 28C78 42 70 58 50 58Z',
  'M50 58C50 72 48 86 50 104',
  'M49 80C40 78 32 72 30 64C40 64 46 70 49 80Z',
  'M51 90C60 88 68 82 70 74C60 74 54 80 51 90Z',
]
// When the last stroke of the rose has been drawn.
const ROSE_DRAWN = 0.2 + (6 - 1) * 0.18 + 1
const SPARKLES = [
  { left: '-30%', top: '5%', size: 10 },
  { left: '105%', top: '18%', size: 8 },
  { left: '-12%', top: '48%', size: 7 },
]

export function PlanCta() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })
  const reduce = useReducedMotion()
  const [word, setWord] = useState(0)

  useEffect(() => {
    if (!inView || reduce) return
    const timer = window.setInterval(() => setWord((w) => (w + 1) % OCCASIONS.length), WORD_SECONDS * 1000)
    return () => window.clearInterval(timer)
  }, [inView, reduce])

  return (
    <section className="px-4 py-16 sm:px-6">
      <div
        ref={ref}
        className="relative isolate mx-auto max-w-3xl overflow-hidden rounded-[2rem] bg-linear-to-br from-white via-[#fbeef5] to-[#f6dbe7] px-6 py-10 text-center shadow-xl shadow-brand-900/5 ring-1 ring-gold-200 sm:py-12"
      >
        {/* Soft glows that breathe behind everything. */}
        <motion.span
          aria-hidden="true"
          className="absolute -top-24 -left-24 -z-10 size-80 rounded-full bg-orchid-300/30 blur-3xl"
          animate={reduce ? undefined : { scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          aria-hidden="true"
          className="absolute -right-24 -bottom-24 -z-10 size-96 rounded-full bg-gold-200/50 blur-3xl"
          animate={reduce ? undefined : { scale: [1.15, 1, 1.15], opacity: [1, 0.6, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />

        {!reduce &&
          PETALS.map((p, i) => (
            <motion.svg
              key={i}
              aria-hidden="true"
              viewBox="0 0 20 28"
              className="absolute -top-10 -z-10"
              style={{ left: p.left, width: p.size, height: p.size * 1.4 }}
              animate={{ y: [0, 420], x: [0, p.drift, 0], rotate: [0, 200, 360], opacity: [0, 0.9, 0.9, 0] }}
              transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
            >
              <path d="M10 0C18 8 18 20 10 28C2 20 2 8 10 0Z" fill={p.color} />
            </motion.svg>
          ))}

        {/* The rose draws itself, its petals fill with blush and its leaves with gold, then it sways
            gently from the stem while small sparkles twinkle around the bloom. */}
        <div className="relative mx-auto w-14 sm:w-16">
          <motion.svg
            viewBox="0 0 100 108"
            aria-hidden="true"
            className="w-full text-gold-500"
            style={{ transformOrigin: '50% 100%' }}
            animate={inView && !reduce ? { rotate: [-5, 5, -5] } : undefined}
            transition={{ delay: ROSE_DRAWN, duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {ROSE.map((d, i) => (
              <motion.path
                key={d}
                d={d}
                fill={i >= 4 ? '#e7cb86' : '#f2c9da'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0, fillOpacity: 0 }}
                animate={inView ? { pathLength: 1, opacity: 1, fillOpacity: i === 2 || i >= 4 ? 0.7 : 0 } : undefined}
                transition={{
                  pathLength: { delay: 0.2 + i * 0.18, duration: 1, ease: 'easeInOut' },
                  opacity: { delay: 0.2 + i * 0.18, duration: 0.3 },
                  fillOpacity: { delay: ROSE_DRAWN - 0.4, duration: 0.8 },
                }}
              />
            ))}
          </motion.svg>
          {!reduce &&
            SPARKLES.map((sp, i) => (
              <motion.svg
                key={i}
                viewBox="0 0 10 10"
                aria-hidden="true"
                className="absolute text-gold-400"
                style={{ left: sp.left, top: sp.top, width: sp.size, height: sp.size }}
                initial={{ opacity: 0, scale: 0 }}
                animate={inView ? { opacity: [0, 1, 0], scale: [0, 1, 0], rotate: [0, 90] } : undefined}
                transition={{ delay: ROSE_DRAWN + i * 0.6, duration: 1.6, repeat: Infinity, repeatDelay: 1.2 }}
              >
                <path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" fill="currentColor" />
              </motion.svg>
            ))}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.6 }}
          className="mt-3 font-caps text-xs font-semibold tracking-[0.35em] text-gold-700 uppercase"
        >
          Your celebration, our craft
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.8 }}
          className="mt-2 text-3xl font-semibold text-brand-800 sm:text-4xl"
        >
          Let's plan your
          <span className="relative mt-2 block h-[1.5em] overflow-hidden font-script text-4xl font-normal text-gold-600 sm:text-5xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={OCCASIONS[word]}
                className="absolute inset-x-0"
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-100%', opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {OCCASIONS[word]}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ delay: 1.1 }}
          className="mx-auto mt-2 max-w-md text-sm text-stone-600 sm:text-base"
        >
          Share your date and your ideas — we'll design it, decorate it and look after every detail on the day.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 1.3 }}
          className="mt-6 flex flex-wrap justify-center gap-3"
        >
          <Link
            to="/contact"
            className="group relative inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-brand-700 px-8 font-semibold text-white shadow-lg shadow-brand-700/20 transition hover:scale-[1.03] hover:bg-brand-800"
          >
            {/* A light sweep across the button every few seconds. */}
            {!reduce && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-white/25"
                animate={{ x: ['0%', '450%'] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
              />
            )}
            <span className="relative">Talk to us</span>
            <ArrowRight className="relative size-4 transition group-hover:translate-x-1" />
          </Link>
          <Link
            to="/estimate"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/70 px-7 font-semibold text-brand-800 ring-1 ring-gold-400 transition hover:bg-gold-100"
          >
            <Calculator className="size-5" /> Estimate your event
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
