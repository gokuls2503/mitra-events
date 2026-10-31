import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { PublicLayout } from '@/public/PublicLayout'
import AboutPage from '@/public/pages/AboutPage'
import ContactPage from '@/public/pages/ContactPage'
import EstimatePage from '@/public/pages/EstimatePage'
import GalleryPage from '@/public/pages/GalleryPage'
import HomePage from '@/public/pages/HomePage'
import NotFoundPage from '@/public/pages/NotFoundPage'
import ServiceDetailPage from '@/public/pages/ServiceDetailPage'
import ServicesPage from '@/public/pages/ServicesPage'
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
          {/* Packages and Testimonials no longer have their own pages; old links land somewhere useful. */}
          <Route path="packages" element={<Navigate to="/services" replace />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="testimonials" element={<Navigate to="/" replace />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="estimate" element={<EstimatePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
