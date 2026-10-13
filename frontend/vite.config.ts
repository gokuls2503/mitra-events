import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/**
 * Makes `vite preview` route like production will:
 *   /admin/*            → spa.html (empty shell; the admin is never pre-rendered)
 *   unknown public URLs → 404.html
 */
function prerenderedRouting(): Plugin {
  return {
    name: 'prerendered-routing',
    configurePreviewServer(server) {
      const dist = server.config.build.outDir
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        if (path.startsWith('/admin')) {
          req.url = '/spa.html'
        } else if (!path.startsWith('/api') && !path.startsWith('/media') && !path.includes('.')) {
          const page = `${path.replace(/\/$/, '')}/index.html`
          if (fs.existsSync(`${dist}${page}`)) {
            req.url = page
          } else {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(fs.readFileSync(`${dist}/404.html`))
            return
          }
        }
        next()
      })
    },
  }
}

// In dev, API calls are proxied to Django so the refresh cookie stays same-origin.
const proxy = {
  '/api': 'http://127.0.0.1:8000',
  '/media': 'http://127.0.0.1:8000',
}

export default defineConfig({
  plugins: [react(), tailwindcss(), prerenderedRouting()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { proxy },
  preview: { proxy },
})
