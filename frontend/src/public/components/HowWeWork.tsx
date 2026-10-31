import { motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { SectionHeading } from './SectionHeading'

/**
 * "How we work": four hand-drawn steps on a gold thread. When the section scrolls into view the
 * thread draws itself left to right, a heart appears as it passes each gap, and each step's text
 * types itself out as the thread reaches it. On wide screens the page holds still until it's done.
 */

const LINE_SECONDS = 3
const TYPE_SECONDS_PER_CHAR = 0.035

const STEPS: { title: string; text: string; art: ReactNode }[] = [
  { title: 'Consult', text: 'We listen to your vision.', art: <BulbArt /> },
  { title: 'Design', text: 'We turn your ideas into beautiful plans.', art: <SketchArt /> },
  { title: 'Decorate', text: 'We bring the details to life.', art: <VaseArt /> },
  { title: 'Celebrate', text: 'You enjoy the day — we handle everything on site.', art: <FlutesArt /> },
]

// One gentle wave across the row; the steps sit at 12.5%, 37.5%, 62.5% and 87.5% of the width.
const THREAD =
  'M0 20 C 40 30, 80 10, 125 20 S 210 30, 250 20 S 330 10, 375 20 S 460 30, 500 20 ' +
  'S 580 10, 625 20 S 710 30, 750 20 S 830 10, 875 20 S 960 30, 1000 20'

// When the last step has finished typing, counted from the moment the section starts animating.
const ANIMATION_SECONDS =
  0.875 * LINE_SECONDS + (`STEP ${STEPS.length}`.length + STEPS.at(-1)!.title.length + STEPS.at(-1)!.text.length) * TYPE_SECONDS_PER_CHAR

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '])

export function HowWeWork() {
  const sectionRef = useRef<HTMLElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  // In one row the text waits for the thread; stacked on small screens it starts right away.
  const [oneRow, setOneRow] = useState(false)
  useEffect(() => setOneRow(window.matchMedia('(min-width: 1024px)').matches), [])
  // In one row it waits until the section is mostly on screen, because the page then holds still for it.
  const inView = useInView(ref, oneRow ? { once: true, amount: 0.8 } : { once: true, margin: '-80px' })
  const reduce = useReducedMotion()

  // In one row, hold the page on this section until the thread and every step have finished,
  // so nobody scrolls past it half drawn. Phones skip this: the stacked steps don't fit one screen.
  useEffect(() => {
    if (!inView || !oneRow || reduce) return
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const stop = (e: Event) => e.preventDefault()
    const stopKeys = (e: KeyboardEvent) => SCROLL_KEYS.has(e.key) && e.preventDefault()
    window.addEventListener('wheel', stop, { passive: false })
    window.addEventListener('touchmove', stop, { passive: false })
    window.addEventListener('keydown', stopKeys)
    const release = () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('keydown', stopKeys)
    }
    const timer = window.setTimeout(release, ANIMATION_SECONDS * 1000)
    return () => {
      window.clearTimeout(timer)
      release()
    }
  }, [inView, oneRow, reduce])

  return (
    <section ref={sectionRef} className="relative overflow-hidden border-y border-gold-200 py-24">
      <FloralSprig className="absolute top-6 left-4 hidden w-28 md:block" />
      <FloralSprig className="absolute right-4 bottom-6 hidden w-28 rotate-180 md:block" />
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="How we work" title="From idea to celebration" />
        <div className="relative">
          {/* The thread runs behind the illustrations, at their centre line. */}
          <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-[4.5rem] hidden h-10 w-full text-gold-400 lg:block">
            <motion.path
              d={THREAD}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : undefined}
              transition={{ duration: LINE_SECONDS, ease: 'linear' }}
            />
          </svg>
          {[0.25, 0.5, 0.75].map((at) => (
            <motion.span
              key={at}
              aria-hidden="true"
              className="absolute top-[4.5rem] hidden -translate-x-1/2 translate-y-2 text-gold-500 lg:block"
              style={{ left: `${at * 100}%` }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={inView ? { opacity: 1, scale: 1 } : undefined}
              transition={{ delay: at * LINE_SECONDS, duration: 0.4 }}
            >
              <HeartLoop />
            </motion.span>
          ))}

          <ol className="relative grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step, i) => {
              // When the thread reaches this step, then label → title → text, one after another.
              const reach = oneRow ? (0.125 + i * 0.25) * LINE_SECONDS : 0.2
              const label = `STEP ${i + 1}`
              const titleAt = reach + label.length * TYPE_SECONDS_PER_CHAR
              const textAt = titleAt + step.title.length * TYPE_SECONDS_PER_CHAR
              return (
                <li key={step.title} className="flex flex-col items-center text-center">
                  <div className="relative grid size-40 place-items-center">
                    <span className="absolute inset-3 rounded-[46%_54%_42%_58%/55%_45%_55%_45%] bg-[#f6dbe7]" aria-hidden="true" />
                    <div className="relative w-24 text-gold-600">{step.art}</div>
                  </div>
                  <p className="mt-3 font-caps text-xs font-semibold tracking-[0.3em] text-gold-700">
                    <TypeOn text={label} start={inView} delay={reach} />
                  </p>
                  <h3 className="mt-1 text-3xl font-semibold text-brand-800">
                    <TypeOn text={step.title} start={inView} delay={titleAt} />
                  </h3>
                  <p className="mt-2 max-w-[15rem] text-stone-600">
                    <TypeOn text={step.text} start={inView} delay={textAt} />
                  </p>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}

/** Types `text` out once `start` is true, after `delay` seconds. Untyped letters keep their space. */
function TypeOn({ text, start, delay }: { text: string; start: boolean; delay: number }) {
  const reduce = useReducedMotion()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!start || reduce) return
    let timer: number | undefined
    const begin = window.setTimeout(() => {
      timer = window.setInterval(() => {
        setCount((n) => {
          if (n + 1 >= text.length) window.clearInterval(timer)
          return Math.min(n + 1, text.length)
        })
      }, TYPE_SECONDS_PER_CHAR * 1000)
    }, delay * 1000)
    return () => {
      window.clearTimeout(begin)
      window.clearInterval(timer)
    }
  }, [start, reduce, delay, text])

  const shown = reduce ? text.length : count
  const typing = start && shown > 0 && shown < text.length
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {typing && <span className="-mr-px inline-block h-[1em] w-px animate-pulse bg-current align-[-0.1em]" />}
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </>
  )
}

// --- Hand-drawn gold line art ---------------------------------------------------------------

function Art({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function BulbArt() {
  return (
    <Art>
      <path d="M32 10C22 10 16 18 16 26c0 7 5 11 8 16v4h16v-4c3-5 8-9 8-16 0-8-6-16-16-16Z" />
      <path d="M28 46v-6c0-4 3-6 4-9 1 3 4 5 4 9v6M25 50h14M27 54h10" />
      <path d="M32 3v3M13 11l2.5 2.5M51 11l-2.5 2.5M6 26h4M54 26h4" />
      <path d="M24 55c-8 0-12-4-14-9 6 0 11 3 14 9ZM40 55c8 0 12-4 14-9-6 0-11 3-14 9Z" />
    </Art>
  )
}

function SketchArt() {
  return (
    <Art>
      <path d="M10 18l32-5 5 37-32 5Z" />
      <path d="M17 26l20-3M18 32l17-2.5M19 38l12-1.8" />
      <path d="M57 7C46 13 37 25 31 40c8-6 18-18 26-33ZM31 40l-3 6M44 18l-6 9" />
      <path d="M8 48c-3-5-2-11 2-15M8 41c3 0 5 2 5 5M9 35c3 0 4 2 4 4" />
    </Art>
  )
}

function VaseArt() {
  return (
    <Art>
      <path d="M24 40c-4 6-2 16 2 18h12c4-2 6-12 2-18-2-2-2-4 0-6H24c2 2 2 4 0 6Z" />
      <path d="M32 34V17M32 30c-4-6-8-10-12-14M32 28c4-6 8-10 12-14" />
      <circle cx="32" cy="13" r="4" />
      <circle cx="19" cy="14" r="3.5" />
      <circle cx="45" cy="12" r="3.5" />
      <path d="M32 24c-3-1-5-4-5-7 3 1 5 4 5 7ZM32 22c3-1 5-4 5-7-3 1-5 4-5 7Z" />
    </Art>
  )
}

function FlutesArt() {
  return (
    <Art>
      <path d="M17 14h9l-1 17c0 4-2 6-3.5 6S18 35 18 31Z" />
      <path d="M21.5 37v15M16 54h11" />
      <path d="M38 14h9l-1 17c0 4-2 6-3.5 6S39 35 39 31Z" />
      <path d="M42.5 37v15M37 54h11" />
      <path d="M18 21h7M39 21h7M32 4v6M29 7h6M12 6l2 2M52 6l-2 2" />
      <circle cx="22" cy="26" r="0.8" />
      <circle cx="43" cy="25" r="0.8" />
    </Art>
  )
}

/** A small loop in the thread, like a heart drawn without lifting the pen. */
function HeartLoop() {
  return (
    <svg viewBox="0 0 24 20" width="22" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 18C6 13 2 10 2 6.5 2 3.5 4.5 2 7 2c2 0 4 1.5 5 3.5C13 3.5 15 2 17 2c2.5 0 5 1.5 5 4.5C22 10 18 13 12 18Z" />
    </svg>
  )
}

/** A soft pink blossom on a gold sprig, for the section's corners. */
function FloralSprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" aria-hidden="true" className={className}>
      <path d="M4 84C30 70 50 50 70 26" stroke="#c9a85c" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M40 58c-8-2-12-8-12-14 8 2 12 8 12 14ZM56 40c-1-8 3-14 9-16-1 8-4 13-9 16ZM24 72c-7 1-13-2-16-8 7-1 13 2 16 8Z" stroke="#c9a85c" strokeWidth="1.1" fill="#f3e3c8" fillOpacity="0.5" />
      <g transform="translate(78 20)">
        {[0, 72, 144, 216, 288].map((r) => (
          <ellipse key={r} cx="0" cy="-9" rx="6" ry="9" transform={`rotate(${r})`} fill="#f2c9da" stroke="#e3aac2" strokeWidth="0.8" />
        ))}
        <circle r="3" fill="#d9b866" />
      </g>
    </svg>
  )
}
