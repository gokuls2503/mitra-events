import { useQuery } from '@tanstack/react-query'

import { settingsQuery } from '../api'
import { Estimator } from '../components/Estimator'
import { PageHero } from '../components/PageHero'
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
        intro="Choose your event, guests and decor style for an instant price range. No sign-up needed."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <Estimator />
      </section>
    </>
  )
}
