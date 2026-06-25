import { computed } from 'vue'
import { useVersionStore } from '@/stores/version'

/**
 * Convenient read-only API for components that need to display version info.
 * clientVersion / clientBuildDate are compile-time constants (never reactive).
 * backendVersion / backendCommit / backendDate are reactive computed refs.
 */
export function useVersionInfo() {
  const store = useVersionStore()

  return {
    clientVersion:   __APP_VERSION__,
    clientBuildDate: __APP_BUILD_DATE__,
    backendVersion:  computed(() => store.backend?.version    ?? '…'),
    backendCommit:   computed(() => store.backend?.git_commit ?? '…'),
    backendDate:     computed(() => store.backend?.build_date ?? '…'),
    fetchError:      computed(() => store.fetchError),
  }
}
