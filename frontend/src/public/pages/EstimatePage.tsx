import { useQuery } from '@tanstack/react-query'

import { settingsQuery } from '../api'
import { Estimator } from '../components/Estimator'
import { heroImage, PageHero } from '../components/PageHero'
import { pageTitle } from '../head'
import { Seo } from '../Seo'

export default function EstimatePage() {
  const { data: site } = useQuery(settingsQuery)
  const title = pageTitle('Event cost estimator', site)

  return (
    <>
      <Seo
        title={title}
        description={`Get an instant price range for your wedding, birthday or corporate event decor in ${site?.city ?? 'Coimbatore'}.`}
        path="/estimate"
      />
      <PageHero
        eyebrow="Cost estimator"
        title="Estimate your event"
        intro="Choose your event and stage size for an instant price range. No sign-up needed."
        image={heroImage(site, 'estimate')}
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <Estimator />
      </section>
    </>
  )
}
