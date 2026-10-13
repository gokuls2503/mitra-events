import { useQuery } from '@tanstack/react-query'
import { useContext, useEffect } from 'react'

import { settingsQuery } from './api'
import { absolute, HeadCollectorContext, localBusinessJsonLd, SITE_URL, type HeadData } from './head'

export function Seo(props: HeadData) {
  const collector = useContext(HeadCollectorContext)
  collector?.set(props)

  const { data: site } = useQuery(settingsQuery)
  const { title, description, path, image, noindex } = props
  // Same JSON-LD block the pre-renderer writes, so client navigation replaces it rather than duplicating it.
  const jsonLd = JSON.stringify([...(site ? [localBusinessJsonLd(site)] : []), ...(props.jsonLd ?? [])])

  // On the client, keep <head> in sync when navigating between pages.
  useEffect(() => {
    document.title = title
    setMeta('name', 'description', description)
    setMeta('name', 'robots', noindex ? 'noindex' : 'index,follow')
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', `${SITE_URL}${path}`)
    setMeta('property', 'og:image', absolute(image) ?? '')
    setLink('canonical', `${SITE_URL}${path}`)
    let script = document.getElementById('site-jsonld')
    if (!script) {
      script = document.createElement('script')
      script.id = 'site-jsonld'
      script.setAttribute('type', 'application/ld+json')
      document.head.appendChild(script)
    }
    script.textContent = jsonLd.replace(/</g, '\\u003c')
  }, [title, description, path, image, noindex, jsonLd])

  return null
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}
