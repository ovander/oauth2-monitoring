import { defineStore } from 'pinia'
import { useLogger } from '@/utils/logger'

const log = useLogger('version')

/**
 * Body of Socrate's GET /api/version (go-oauth2 HealthHandler.Version).
 * Field names are the server's JSON keys; build_time is RFC 3339 UTC.
 */
export interface BackendVersion {
  version:    string
  commit:     string
  branch:     string
  build_time: string
  /**
   * Go toolchain that built the server (`runtime.Version()`, e.g. "go1.27.1").
   * Added in Socrate after v1.4.0; absent on older servers.
   */
  go_version?: string
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
    clientBuildNode: (): string => __APP_BUILD_NODE__,
    clientBuildVite: (): string => __APP_BUILD_VITE__,
    /** Toolchain that built the console, e.g. "Node v20.18.0 · Vite 7.1.3". */
    clientToolchain: (): string => `Node ${__APP_BUILD_NODE__} · Vite ${__APP_BUILD_VITE__}`,
  },

  actions: {
    async fetchBackend() {
      try {
        // /api/version is a public endpoint — no auth token required.
        // Cache-Control: no-store is set by the backend so this always hits the wire.
        const res = await fetch('/api/version')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        this.backend = await res.json() as BackendVersion
        log.debug('backend version:', this.backend.version, '@', this.backend.commit)
      } catch (err: unknown) {
        this.fetchError = true
        log.warn('could not fetch backend version:', err instanceof Error ? err.message : err)
      }
    }
  }
})
