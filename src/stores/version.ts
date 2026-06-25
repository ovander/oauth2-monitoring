import { defineStore } from 'pinia'
import { useLogger } from '@/utils/logger'

const log = useLogger('version')

export interface BackendVersion {
  version:    string
  build_date: string
  git_commit: string
}

export const useVersionStore = defineStore('version', {
  state: () => ({
    backend:    null as BackendVersion | null,
    fetchError: false,
  }),

  getters: {
    // Build-time constants injected by Vite (see vite.config.ts + src/env.d.ts)
    clientVersion:   (): string => __APP_VERSION__,
    clientBuildDate: (): string => __APP_BUILD_DATE__,
  },

  actions: {
    async fetchBackend() {
      try {
        // /api/version is a public endpoint — no auth token required.
        // Cache-Control: no-store is set by the backend so this always hits the wire.
        const res = await fetch('/api/version')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        this.backend = await res.json() as BackendVersion
        log.debug('backend version:', this.backend.version, '@', this.backend.git_commit)
      } catch (err: unknown) {
        this.fetchError = true
        log.warn('could not fetch backend version:', err instanceof Error ? err.message : err)
      }
    }
  }
})
