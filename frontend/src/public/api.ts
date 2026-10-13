import { queryOptions } from '@tanstack/react-query'
import axios from 'axios'

/**
 * Public (no-auth) API. A separate axios instance from the admin client so a
 * stale admin token can never affect the public site. During build-time
 * pre-rendering the base URL is pointed at the running Django server.
 */
export const publicApi = axios.create({ baseURL: '/api/v1' })

export function setPublicApiBase(url: string) {
  publicApi.defaults.baseURL = url
}

export type EventType =
  | 'WEDDING'
  | 'ENGAGEMENT'
  | 'RECEPTION'
  | 'BIRTHDAY'
  | 'BABY_SHOWER'
  | 'HOUSEWARMING'
  | 'CORPORATE'
  | 'TRADITIONAL'
  | 'OTHER'

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  WEDDING: 'Wedding',
  ENGAGEMENT: 'Engagement',
  RECEPTION: 'Reception',
  BIRTHDAY: 'Birthday',
  BABY_SHOWER: 'Baby shower / Seemantham',
  HOUSEWARMING: 'Housewarming',
  CORPORATE: 'Corporate event',
  TRADITIONAL: 'Puja & traditional',
  OTHER: 'Other',
}

export interface SiteSettings {
  business_name: string
  tagline: string
  phone: string
  phone_2: string
  whatsapp: string
  email: string
  address: string
  city: string
  map_embed_url: string
  business_hours: string
  instagram_url: string
  facebook_url: string
  youtube_url: string
  hero_title: string
  hero_subtitle: string
  hero_image: string | null
  about_title: string
  about_body: string
  about_image: string | null
  stat_events: number
  stat_years: number
  stat_clients: number
}

export interface Service {
  slug: string
  name: string
  category: EventType
  category_label: string
  short_description: string
  description: string
  highlights: string[]
  cover_image: string | null
  starting_price: string | null
  is_featured: boolean
  seo_title: string
  seo_description: string
}

export interface Package {
  slug: string
  name: string
  tagline: string
  event_type: EventType | ''
  event_type_label: string
  price: string
  price_note: string
  inclusions: string[]
  is_popular: boolean
}

export interface GalleryImage {
  id: number
  image: string
  /** Event type, used by service pages. Empty for photos uploaded from the admin Gallery. */
  category: EventType | ''
  category_label: string
  /** Admin-managed gallery category; null = Uncategorised (shown under "All" only). */
  gallery_category: number | null
  gallery_category_name: string | null
  caption: string
  alt_text: string
  is_featured: boolean
}

export interface Testimonial {
  id: number
  client_name: string
  event_type: EventType | ''
  event_type_label: string
  event_location: string
  quote: string
  rating: number
  photo: string | null
  is_featured: boolean
}

export interface EstimatorOptions {
  event_types: {
    id: number
    event_type: EventType
    label: string
    description: string
    base_price: string
    per_guest_rate: string
    min_guests: number
    max_guests: number
  }[]
  tiers: { id: number; name: string; description: string; multiplier: string }[]
  addons: { id: number; name: string; description: string; pricing: 'FLAT' | 'PER_GUEST'; price: string }[]
}

export interface EstimateInput {
  event_type: EventType
  guests: number
  tier: number
  addons: number[]
}

export interface EstimateResult {
  event_type: EventType
  event_type_label: string
  guests: number
  tier: string
  lines: { label: string; amount: number }[]
  total: number
  low: number
  high: number
  note: string
}

const get = async <T>(url: string) => (await publicApi.get<T>(url)).data

export const settingsQuery = queryOptions({
  queryKey: ['public', 'settings'],
  queryFn: () => get<SiteSettings>('/website/settings/'),
})

export const servicesQuery = queryOptions({
  queryKey: ['public', 'services'],
  queryFn: () => get<Service[]>('/website/services/'),
})

export const serviceQuery = (slug: string) =>
  queryOptions({
    queryKey: ['public', 'services', slug],
    queryFn: () => get<Service>(`/website/services/${encodeURIComponent(slug)}/`),
    retry: false,
  })

export const packagesQuery = queryOptions({
  queryKey: ['public', 'packages'],
  queryFn: () => get<Package[]>('/website/packages/'),
})

export const galleryQuery = queryOptions({
  queryKey: ['public', 'gallery'],
  queryFn: () => get<GalleryImage[]>('/website/gallery/'),
})

export interface GalleryCategory {
  id: number
  name: string
}

/** Every gallery category from the admin, including ones with no photos yet. */
export const galleryCategoriesQuery = queryOptions({
  queryKey: ['public', 'gallery-categories'],
  queryFn: () => get<GalleryCategory[]>('/website/gallery-categories/'),
})

export const testimonialsQuery = queryOptions({
  queryKey: ['public', 'testimonials'],
  queryFn: () => get<Testimonial[]>('/website/testimonials/'),
})

export const estimatorQuery = queryOptions({
  queryKey: ['public', 'estimator'],
  queryFn: () => get<EstimatorOptions>('/website/estimator/'),
})

export async function fetchEstimate(input: EstimateInput) {
  return (await publicApi.post<EstimateResult>('/website/estimate/', input)).data
}

export interface EnquiryPayload {
  name: string
  phone: string
  email?: string
  event_type?: EventType | ''
  event_date?: string | null
  venue?: string
  guest_count?: number | null
  message?: string
  service?: string | null
  package?: string | null
  source_page?: string
  estimate_input?: EstimateInput
  website?: string
}

export async function sendEnquiry(payload: EnquiryPayload) {
  return (await publicApi.post<{ ok: boolean }>('/website/enquiry/', payload)).data
}
