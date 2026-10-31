import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import type { SiteSettings } from '../api'
import { LotusDivider } from './Brand'
import { useHeroNav } from './HeroNav'

interface Props {
  eyebrow: string
  title: string
  /** Optional word set in the card's gold script after the title, e.g. "Memorable". */
  accent?: string
  intro?: ReactNode
  /** Banner photo, from `heroImage()`; nothing is drawn until the settings have loaded. */
  image: string | undefined
}

/** Each page's own built-in banner, shown until the admin uploads one in Website content → Settings. */
const PAGE_HEROES = {
  home: { field: 'hero_image', photo: '/images/hero-stage.jpg' },
  about: { field: 'about_hero_image', photo: '/images/heroes/about.jpg' },
  services: { field: 'services_hero_image', photo: '/images/heroes/services.jpg' },
  gallery: { field: 'gallery_hero_image', photo: '/images/heroes/gallery.jpg' },
  contact: { field: 'contact_hero_image', photo: '/images/heroes/contact.jpg' },
  estimate: { field: 'estimate_hero_image', photo: '/images/heroes/estimate.jpg' },
} as const satisfies Record<string, { field: keyof SiteSettings; photo: string }>

/** The slideshow photo on a service page that has no photos of its own yet. */
export const SERVICE_HERO_PHOTO = '/images/heroes/service.jpg'

/** The page's uploaded banner, else its built-in one; undefined while the settings load, so it never flashes. */
export function heroImage(site: SiteSettings | undefined, page: keyof typeof PAGE_HEROES) {
  if (!site) return undefined
  const { field, photo } = PAGE_HEROES[page]
  return site[field] || photo
}

/** Photo banner at the top of inner pages, like the home hero. Holds the page's single <h1>. */
export function PageHero({ eyebrow, title, accent, intro, image }: Props) {
  useHeroNav()
  return (
    <section className="relative isolate overflow-hidden border-b border-gold-200 bg-brand-900">
      {image && <img src={image} alt="" fetchPriority="high" className="absolute inset-0 -z-20 size-full object-cover" />}
      {/* A light dark shade keeps the photo clear and the white text readable. */}
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-black/55 via-black/40 to-black/55" />
      <div className="mx-auto max-w-4xl px-6 pt-40 pb-24 text-center sm:pt-44 sm:pb-28">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-caps text-xs font-bold tracking-[0.35em] text-gold-300 uppercase [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] sm:text-sm"
        >
          {eyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-5xl leading-tight font-bold text-white drop-shadow-lg sm:text-6xl"
        >
          {title}
          {accent && <span className="mt-1 block font-script text-6xl font-normal text-gold-300 sm:text-7xl">{accent}</span>}
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <LotusDivider className="mt-5 [&>img]:opacity-100 [&>img]:saturate-100 [&>span]:h-0.5 [&>span]:to-gold-300" />
        </motion.div>
        {intro && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mx-auto mt-5 max-w-2xl text-lg text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]"
          >
            {intro}
          </motion.p>
        )}
      </div>
    </section>
  )
}
