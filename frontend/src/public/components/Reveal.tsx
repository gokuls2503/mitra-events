import { animate, motion, useInView } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li' | 'section'
}

/** Fades content up as it scrolls into view. Motion honours prefers-reduced-motion via <MotionConfig>. */
export function Reveal({ children, delay = 0, className, as = 'div' }: RevealProps) {
  const Comp = motion[as]
  return (
    <Comp
      data-reveal
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  )
}

/**
 * Counts up from 0 when scrolled into view. The server-rendered HTML shows the
 * final number (good for crawlers and no-JS); the count-up only runs client-side.
 */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  useEffect(() => {
    if (!inView || !ref.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const node = ref.current
    const controls = animate(0, value, {
      duration: 1.6,
      ease: 'easeOut',
      onUpdate: (v) => {
        node.textContent = `${Math.round(v).toLocaleString('en-IN')}${suffix}`
      },
    })
    return () => controls.stop()
  }, [inView, value, suffix])

  return (
    <span ref={ref}>
      {value.toLocaleString('en-IN')}
      {suffix}
    </span>
  )
}
