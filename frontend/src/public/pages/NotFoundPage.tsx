import { Link } from 'react-router-dom'

import { Seo } from '../Seo'

export default function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl px-4 py-32 text-center">
      <Seo title="Page not found | Mitra Events" description="This page doesn't exist." path="/404" noindex />
      <p className="font-display text-8xl font-semibold text-gold-400">404</p>
      <h1 className="mt-2 text-4xl font-semibold text-brand-800">Page not found</h1>
      <p className="mt-3 text-stone-600">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="mt-8 inline-block rounded-full bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-800">
        Back to home
      </Link>
    </section>
  )
}
