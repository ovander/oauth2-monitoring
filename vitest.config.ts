import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfigFn from './vite.config'
import { fileURLToPath, URL } from 'node:url'

// vite.config.ts exports a function (to support mode-based `base`).
// mergeConfig can't handle function-form configs, so we call it first.
const viteConfig = typeof viteConfigFn === 'function'
  ? viteConfigFn({ mode: 'test', command: 'serve', isSsrBuild: false })
  : viteConfigFn

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/types/',
        '**/*.d.ts',
        'src/__tests__/'
      ]
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
}))
