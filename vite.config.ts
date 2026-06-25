import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => ({
  // In production the SPA is served from https://golfperformance.fr/monitoring/
  // In dev (npm run dev) it runs at http://localhost:5180/
  base: mode === 'production' ? '/monitoring/' : '/',

  // Inject build-time version constants — available as __APP_VERSION__ and
  // __APP_BUILD_DATE__ globally in all source files (declared in src/env.d.ts).
  define: {
    __APP_VERSION__:    JSON.stringify(pkg.version),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },

  plugins: [
    vue(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://golfperformance.fr:8091',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (_proxyReq, origReq) => {
            console.log(`[vite:proxy] → ${origReq.method} https://golfperformance.fr:8091${origReq.url}`)
          })
          proxy.on('proxyRes', (proxyRes, origReq) => {
            console.log(`[vite:proxy] ← ${proxyRes.statusCode} ${origReq.url}`)
          })
          proxy.on('error', (err, origReq) => {
            console.error(`[vite:proxy] ERROR on ${origReq.url}:`, err.message)
          })
        }
      },
      // Proxy OAuth token endpoint to avoid cross-origin fetch issues in dev
      '/oauth/token': {
        target: 'https://golfperformance.fr',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (_req, origReq) => {
            console.log(`[vite:proxy] → POST https://golfperformance.fr${origReq.url}`)
          })
          proxy.on('proxyRes', (proxyRes, origReq) => {
            console.log(`[vite:proxy] ← ${proxyRes.statusCode} ${origReq.url}`)
          })
          proxy.on('error', (err, origReq) => {
            console.error(`[vite:proxy] ERROR on ${origReq.url}:`, err.message)
          })
        }
      }
    }
  }
}))
