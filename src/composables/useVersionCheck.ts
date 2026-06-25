import { onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useVersionStore } from '@/stores/version'
import { useLogger } from '@/utils/logger'

const log = useLogger('version-check')

/**
 * Background stale-tab detection.
 *
 * Polls GET /api/version every `intervalMs` (default 5 min).
 * If the backend version has changed since the tab was opened a sticky
 * PrimeVue toast prompts the user to refresh — we never force-reload.
 *
 * Mount once in App.vue via <script setup>:
 *   useVersionCheck()
 */
export function useVersionCheck(intervalMs = 5 * 60 * 1000) {
  const store = useVersionStore()
  const toast = useToast()

  // Capture the version that was live when this tab first opened.
  // store.fetchBackend() is already called in main.ts so backend may already
  // be populated; if not, we wait for the promise to resolve.
  let snapshot: string | null = null

  store.fetchBackend().then(() => {
    snapshot = store.backend?.version ?? null
    log.debug('stale-check snapshot:', snapshot)
  })

  async function check() {
    try {
      // Cache-bust with timestamp so we always get the latest
      const res  = await fetch(`/api/version?t=${Date.now()}`)
      if (!res.ok) return
      const data = await res.json() as { version: string }

      if (snapshot && data.version !== snapshot) {
        log.warn('backend version changed:', snapshot, '→', data.version)
        notifyUpdateAvailable()
        // Update snapshot so we don't show the toast again on the next tick
        snapshot = data.version
      }
    } catch {
      // Offline or network error — silently ignore
    }
  }

  function notifyUpdateAvailable() {
    toast.add({
      severity: 'info',
      summary:  'Update Available',
      detail:   'A new version has been deployed. Refresh the page to get the latest.',
      life:     0,   // sticky — user must dismiss
    })
  }

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = setInterval(check, intervalMs)
  })

  onUnmounted(() => {
    if (timer !== null) clearInterval(timer)
  })
}
