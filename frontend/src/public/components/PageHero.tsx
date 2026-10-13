import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { CornerSwoosh, LotusDivider, LotusMark } from './Brand'

interface Props {
  eyebrow: string
  title: string
  /** Optional word set in the card's gold script after the title, e.g. "Memorable". */
  accent?: string
  intro?: ReactNode
}

/** Light banner at the top of inner pages, styled after the visiting card. Holds the page's single <h1>. */
export function PageHero({ eyebrow, title, accent, intro }: Props) {
  return (
    <section className="relative isolate overflow-hidden border-b border-gold-200 bg-linear-to-b from-ivory to-cream">
      <CornerSwoosh corner="top-left" className="-z-10" />
      <CornerSwoosh corner="bottom-right" className="-z-10" />
      {/* Faint lotus watermark, like the card's background petals. */}
      <LotusMark tone="gold" className="absolute top-1/2 left-1/2 -z-10 h-auto w-[34rem] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.07]" />
      <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-24">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-caps text-xs font-semibold tracking-[0.35em] text-gold-700 uppercase sm:text-sm"
        >
          {eyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-5xl leading-tight font-semibold text-brand-800 sm:text-6xl"
        >
          {title}
          {accent && <span className="mt-1 block font-script text-6xl font-normal text-gold-600 sm:text-7xl">{accent}</span>}
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <LotusDivider className="mt-5" />
        </motion.div>
        {intro && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mx-auto mt-5 max-w-2xl text-lg text-stone-600"
          >
            {intro}
          </motion.p>
        )}
      </div>
    </section>
  )
}
