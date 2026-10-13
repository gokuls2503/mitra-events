/**
 * Build-time renderer used by scripts/prerender.mjs. Not shipped to browsers.
 */
import { dehydrate, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PassThrough } from 'node:stream'
import { StrictMode } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { StaticRouter } from 'react-router-dom'

import { setPublicApiBase, settingsQuery, type SiteSettings } from './public/api'
import { queriesForPath, STATIC_ROUTES } from './public/routeData'
import { HeadCollectorContext, renderHeadTags, type HeadData } from './public/head'
import { AppRoutes } from './routes'

export { setPublicApiBase, STATIC_ROUTES }

export interface RenderResult {
  html: string
  head: string
  state: unknown
  /** False when a page's data failed to load (e.g. an unknown service slug). */
  ok: boolean
}

export async function render(url: string): Promise<RenderResult> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const results = await Promise.allSettled(queriesForPath(url).map((q) => queryClient.fetchQuery(q as Parameters<typeof queryClient.fetchQuery>[0])))
  const ok = results.every((r) => r.status === 'fulfilled')

  let head: HeadData = { title: 'Mitra Events Management', description: '', path: url }
  const collector = { set: (d: HeadData) => (head = d) }

  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <HeadCollectorContext.Provider value={collector}>
        <QueryClientProvider client={queryClient}>
          <StaticRouter location={url}>
            <AppRoutes />
          </StaticRouter>
        </QueryClientProvider>
      </HeadCollectorContext.Provider>
    </StrictMode>,
  )
  const html = await streamToString(prelude)
  const site = queryClient.getQueryData<SiteSettings>(settingsQuery.queryKey)

  // Failed queries are dropped so the browser refetches instead of hydrating an error.
  const state = dehydrate(queryClient, { shouldDehydrateQuery: (q) => q.state.status === 'success' })
  return { html, head: renderHeadTags(head, site), state, ok }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  const pass = new PassThrough()
  stream.pipe(pass)
  for await (const chunk of pass) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
