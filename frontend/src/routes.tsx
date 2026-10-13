import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { PublicLayout } from '@/public/PublicLayout'
import AboutPage from '@/public/pages/AboutPage'
import ContactPage from '@/public/pages/ContactPage'
import EstimatePage from '@/public/pages/EstimatePage'
import GalleryPage from '@/public/pages/GalleryPage'
import HomePage from '@/public/pages/HomePage'
import NotFoundPage from '@/public/pages/NotFoundPage'
import PackagesPage from '@/public/pages/PackagesPage'
import ServiceDetailPage from '@/public/pages/ServiceDetailPage'
import ServicesPage from '@/public/pages/ServicesPage'
import TestimonialsPage from '@/public/pages/TestimonialsPage'
import { FullPageSpinner } from '@/shared/ui/Spinner'

// Public pages are imported eagerly so they pre-render and hydrate cleanly.
// The admin is a separate lazy chunk that public visitors never download.
const AdminApp = lazy(() => import('@/admin/AdminApp'))

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="services/:slug" element={<ServiceDetailPage />} />
          <Route path="packages" element={<PackagesPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="testimonials" element={<TestimonialsPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="estimate" element={<EstimatePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
