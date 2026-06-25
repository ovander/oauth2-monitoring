import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => {
  // Dev-proxy upstreams are configurable and default to localhost — no
  // deployment host is hardcoded in source. Override via .env(.local):
  //   DEV_API_PROXY_TARGET=https://admin.example.com
  //   DEV_OAUTH_PROXY_TARGET=https://auth.example.com
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.DEV_API_PROXY_TARGET || env.VITE_ADMIN_URL || 'http://localhost:8081'
  const oauthTarget = env.DEV_OAUTH_PROXY_TARGET || env.VITE_OAUTH_URL || 'http://localhost:8080'

  return {
  // Served under /monitoring/ in production, root in dev.
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
        target: apiTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (_proxyReq, origReq) => {
            console.log(`[vite:proxy] → ${origReq.method} ${apiTarget}${origReq.url}`)
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
        target: oauthTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (_req, origReq) => {
            console.log(`[vite:proxy] → POST ${oauthTarget}${origReq.url}`)
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
  }
})
