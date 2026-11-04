import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import { AppRoutes } from './routes'

// Data the pre-renderer embedded in the page (see scripts/prerender.mjs); absent in the admin and dev.
const stateTag = document.getElementById('rq-state')
const prerenderedState: DehydratedState | undefined = stateTag?.textContent ? JSON.parse(stateTag.textContent) : undefined

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={prerenderedState}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </HydrationBoundary>
    </QueryClientProvider>
  </StrictMode>
)

const root = document.getElementById('root')!
// Pre-rendered public pages arrive with HTML already inside #root; hydrate those.
// The admin (and dev server) start from an empty #root.
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
