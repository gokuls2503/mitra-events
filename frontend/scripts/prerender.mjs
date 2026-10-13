/**
 * Pre-renders every public page to static HTML after `vite build`.
 *
 *   PRERENDER_API_URL  Django API to read content from (default http://127.0.0.1:8000/api/v1)
 *   VITE_SITE_URL      Public site origin, used for canonical URLs and sitemap.xml
 *
 * Output:
 *   dist/<route>/index.html   pre-rendered pages (served as-is)
 *   dist/404.html             not-found page
 *   dist/spa.html             empty shell — the server must fall back to this for /admin/*
 *   dist/sitemap.xml, dist/robots.txt
 *
 * Content edited in the admin appears instantly for visitors (pages refetch on load),
 * but search engines see it after the next build.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const API = process.env.PRERENDER_API_URL ?? 'http://127.0.0.1:8000/api/v1'
const SITE_URL = (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '')

const template = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
await fs.writeFile(path.join(dist, 'spa.html'), template)

const { render, setPublicApiBase, STATIC_ROUTES } = await import(path.join(root, 'dist-ssr/entry-server.js'))
setPublicApiBase(API)

let slugs = []
try {
  const res = await fetch(`${API}/website/services/`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  slugs = (await res.json()).map((s) => s.slug)
} catch (err) {
  console.error(`\n✗ Could not reach the API at ${API} (${err.message}).`)
  console.error('  Start Django first, or set PRERENDER_API_URL.\n')
  process.exit(1)
}

const routes = [...STATIC_ROUTES, ...slugs.map((s) => `/services/${s}`)]

function page({ html, head, state }) {
  const json = JSON.stringify(state).replace(/</g, '\\u003c')
  return template
    .replace(/<!--head:start-->[\s\S]*<!--head:end-->/, head)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>\n    <script>window.__RQ_STATE__=${json}</script>`)
}

for (const route of routes) {
  const result = await render(route)
  if (!result.ok) {
    console.error(`✗ ${route} — data failed to load`)
    process.exitCode = 1
    continue
  }
  const file = path.join(dist, route === '/' ? '' : route, 'index.html')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, page(result))
  console.log(`✓ ${route}`)
}

await fs.writeFile(path.join(dist, '404.html'), page(await render('/__not-found__')))
console.log('✓ 404.html')

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((r) => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`
await fs.writeFile(path.join(dist, 'sitemap.xml'), sitemap)
await fs.writeFile(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
)
console.log(`✓ sitemap.xml (${routes.length} URLs), robots.txt`)
if (!SITE_URL) console.warn('⚠ VITE_SITE_URL is not set — canonical URLs and sitemap entries are relative.')
