import { createContext } from 'react'

import type { SiteSettings } from './api'

export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export interface HeadData {
  title: string
  description: string
  path: string
  image?: string | null
  jsonLd?: Record<string, unknown>[]
  noindex?: boolean
}

/** During pre-rendering, <Seo> reports here so the build script can write real <head> tags. */
export const HeadCollectorContext = createContext<{ set: (d: HeadData) => void } | null>(null)

export function absolute(url: string | null | undefined) {
  if (!url) return undefined
  return url.startsWith('http') ? url : `${SITE_URL}${url}`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Used by the pre-render script to produce the static <head> for a page. */
export function renderHeadTags(head: HeadData, site: SiteSettings | undefined): string {
  const url = `${SITE_URL}${head.path}`
  const image = absolute(head.image ?? site?.hero_image)
  const jsonLd = [...(site ? [localBusinessJsonLd(site)] : []), ...(head.jsonLd ?? [])]
  return [
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.description)}" />`,
    `<meta name="robots" content="${head.noindex ? 'noindex' : 'index,follow'}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(site?.business_name ?? 'Mitra Events')}" />`,
    `<meta property="og:title" content="${escapeHtml(head.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(head.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json" id="site-jsonld">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ')
}

export function localBusinessJsonLd(site: SiteSettings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#business`,
    name: site.business_name,
    description: site.tagline,
    url: `${SITE_URL}/`,
    telephone: site.phone || undefined,
    email: site.email || undefined,
    image: absolute(site.hero_image),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address ? site.address.split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean).join(', ') : undefined,
      postalCode: site.address.match(/\b\d{6}\b/)?.[0],
      addressLocality: site.city,
      addressRegion: 'Tamil Nadu',
      addressCountry: 'IN',
    },
    areaServed: site.city,
    sameAs: [site.instagram_url, site.facebook_url, site.youtube_url].filter(Boolean),
  }
}

/** Builds a page title like "Packages | Mitra Events Management". */
export function pageTitle(page: string | null, site: SiteSettings | undefined) {
  const brand = site?.business_name ?? 'Mitra Events Management'
  return page ? `${page} | ${brand}` : `${brand} | Event Decorations in ${site?.city ?? 'Coimbatore'}`
}
