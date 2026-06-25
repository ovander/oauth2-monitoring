import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => {
  // In dev, proxy the cookie-auth surface (/bff and /api) to a locally-running
  // monitoring BFF. Configurable; defaults to the BFF's default bind. Override:
  //   DEV_BFF_TARGET=http://127.0.0.1:8090
  const env = loadEnv(mode, process.cwd(), '')
  const bffTarget = env.DEV_BFF_TARGET || 'http://127.0.0.1:8090'

  const proxyEntry = {
    target: bffTarget,
    changeOrigin: true,
    configure(proxy: any) {
      proxy.on('proxyReq', (_req: any, origReq: any) => {
        console.log(`[vite:proxy] → ${origReq.method} ${bffTarget}${origReq.url}`)
      })
      proxy.on('error', (err: any, origReq: any) => {
        console.error(`[vite:proxy] ERROR on ${origReq.url}:`, err.message)
      })
    }
  }

  return {
  base: '/',

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
      // Both the cookie-auth BFF routes and the admin API go through the BFF.
      '/bff': proxyEntry,
      '/api': proxyEntry
    }
  }
  }
})
