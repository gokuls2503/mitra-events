import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ImageIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { galleryCategoriesQuery, galleryQuery, settingsQuery, type GalleryImage } from '../api'
import { Lightbox } from '../components/Lightbox'
import { PageHero } from '../components/PageHero'
import { Reveal } from '../components/Reveal'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

/**
 * Every category from the admin, each with only its featured photos. Categories with none
 * still show, with "Photos coming soon". Uncategorised photos aren't shown.
 */
export default function GalleryPage() {
  const { data: site } = useQuery(settingsQuery)
  const { data: images = [] } = useQuery(galleryQuery)
  const { data: categories = [] } = useQuery(galleryCategoriesQuery)
  const [filter, setFilter] = useState<number | 'ALL'>('ALL')
  const [open, setOpen] = useState<number | null>(null)
  const title = pageTitle('Gallery', site)

  const sections = useMemo(
    () =>
      categories.map((c) => ({
        ...c,
        photos: images.filter((i) => i.is_featured && i.gallery_category === c.id),
      })),
    [categories, images],
  )
  const shownSections = filter === 'ALL' ? sections : sections.filter((s) => s.id === filter)
  // One list for the lightbox, so next/previous moves through everything on screen.
  const shownPhotos: GalleryImage[] = shownSections.flatMap((s) => s.photos)

  return (
    <>
      <Seo
        title={title}
        description={`Photos of weddings, receptions, birthdays and corporate events decorated by ${site?.business_name ?? 'Mitra Events'}.`}
        path="/gallery"
        image={sections.find((s) => s.photos.length)?.photos[0].image}
      />
      <PageHero eyebrow="Gallery" title="Our work" intro="A glimpse of celebrations we've had the joy of decorating." />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        {categories.length > 1 && (
          <div role="tablist" aria-label="Filter by category" className="mb-10 flex flex-wrap justify-center gap-2">
            {[{ id: 'ALL' as const, name: 'All' }, ...categories].map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={filter === c.id}
                onClick={() => setFilter(c.id)}
                className={clsx(
                  'min-h-11 rounded-full px-4 text-sm font-medium transition',
                  filter === c.id ? 'bg-brand-700 text-white' : 'bg-white text-stone-700 ring-1 ring-brand-100 hover:ring-brand-300',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-14">
          {shownSections.map((s) => (
            <section key={s.id} aria-labelledby={`gallery-${s.id}`}>
              <Reveal>
                <h2 id={`gallery-${s.id}`} className="mb-5 text-3xl font-semibold text-brand-800">
                  {s.name}
                </h2>
                {s.photos.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {s.photos.map((img) => (
                      <li key={img.id}>
                        <button
                          onClick={() => setOpen(shownPhotos.indexOf(img))}
                          className="group relative block aspect-3/2 w-full overflow-hidden rounded-xl focus-visible:outline-3 focus-visible:outline-brand-500"
                          aria-label={`View ${img.caption || 'image'}`}
                        >
                          <img
                            src={img.image}
                            alt={img.alt_text || img.caption}
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          {img.caption && (
                            <span className="absolute inset-x-0 bottom-0 translate-y-full bg-linear-to-t from-black/70 to-transparent p-3 text-left text-sm text-white transition group-hover:translate-y-0 group-focus-visible:translate-y-0">
                              {img.caption}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-3 rounded-xl bg-white px-5 py-6 text-stone-600 ring-1 ring-brand-100">
                    <ImageIcon className="size-5 shrink-0 text-brand-400" aria-hidden />
                    Photos coming soon.
                  </p>
                )}
              </Reveal>
            </section>
          ))}
        </div>
        {categories.length === 0 && <p className="text-center text-stone-500">Photos coming soon.</p>}
      </section>

      <Lightbox images={shownPhotos} index={open} onChange={setOpen} />
    </>
  )
}
