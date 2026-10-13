import {
  estimatorQuery,
  galleryCategoriesQuery,
  galleryQuery,
  packagesQuery,
  serviceQuery,
  servicesQuery,
  settingsQuery,
  testimonialsQuery,
} from './api'

/** Public routes that are pre-rendered at build time (service detail pages are added from the API). */
export const STATIC_ROUTES = ['/', '/about', '/services', '/packages', '/gallery', '/testimonials', '/contact', '/estimate']

/** The data each page needs, fetched before pre-rendering so the HTML contains real content. */
export function queriesForPath(path: string) {
  // The layout (header/footer) needs settings + services on every page.
  const base = [settingsQuery, servicesQuery]
  const detail = path.match(/^\/services\/([^/]+)$/)
  if (detail) return [...base, serviceQuery(detail[1]), galleryQuery]
  switch (path) {
    case '/':
      return [...base, packagesQuery, galleryQuery, testimonialsQuery]
    case '/packages':
    case '/contact':
      return [...base, packagesQuery]
    case '/gallery':
      return [...base, galleryQuery, galleryCategoriesQuery]
    case '/testimonials':
      return [...base, testimonialsQuery]
    case '/estimate':
      return [...base, estimatorQuery]
    default:
      return base
  }
}
