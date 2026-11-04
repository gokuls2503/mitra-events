import type { EventType, ServiceImage } from '@/public/api'
import { EVENT_TYPE_LABELS } from '@/public/api'

export const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))

export interface CmsService {
  id: number
  slug: string
  name: string
  category: EventType
  category_label: string
  short_description: string
  description: string
  highlights: string[]
  keywords: string[]
  /** "Label: value" lines. */
  details: string[]
  policies: string[]
  payment_terms: string[]
  cover_image: string | null
  images: ServiceImage[]
  starting_price: string | null
  is_featured: boolean
  is_published: boolean
  order: number
  seo_title: string
  seo_description: string
}

export interface CmsServiceImage {
  id: number
  service: number
  image: string
  caption: string
  order: number
}

export interface CmsPackage {
  id: number
  slug: string
  name: string
  tagline: string
  event_type: EventType | ''
  event_type_label: string
  price: string
  price_note: string
  inclusions: string[]
  is_popular: boolean
  is_published: boolean
  order: number
}

export interface CmsTestimonial {
  id: number
  client_name: string
  event_type: EventType | ''
  event_type_label: string
  event_location: string
  quote: string
  rating: number
  photo: string | null
  is_featured: boolean
  is_published: boolean
  order: number
}

export interface CmsFaq {
  id: number
  question: string
  answer: string
  is_published: boolean
  order: number
}

export interface CmsEstimatorEventType {
  id: number
  event_type: EventType
  label: string
  description: string
  base_price: string
  rate_per_sqft: string
  min_sqft: number
  max_sqft: number
  is_active: boolean
  order: number
}

export interface CmsEstimatorAddon {
  id: number
  name: string
  description: string
  pricing: 'FLAT' | 'PER_GUEST'
  price: string
  is_active: boolean
  order: number
}
