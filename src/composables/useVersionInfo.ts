import { computed } from 'vue'
import { useVersionStore } from '@/stores/version'

/**
 * Prefixes a version with "v" unless it already carries one: Socrate's
 * `version` is a `git describe` value ("v1.4.2"), the console's is the bare
 * package.json version ("1.0.0-rc.1"). Avoids rendering "vv1.4.2".
 */
export function withVPrefix(version: string): string {
  return /^v\d/i.test(version) ? version : `v${version}`
}

/**
 * Convenient read-only API for components that need to display version info.
 * clientVersion / clientBuildDate / clientToolchain are compile-time constants
 * (never reactive). The backend* values are reactive computed refs:
 * backendVersion / backendCommit / backendDate fall back to '…' until the
 * server answers; backendBranch / backendBuildTime / backendGoVersion are ''
 * when the server did not send them (go_version is absent on servers up to
 * v1.4.0).
 */
export function useVersionInfo() {
  const store = useVersionStore()

  return {
    clientVersion:    __APP_VERSION__,
    clientBuildDate:  __APP_BUILD_DATE__,
    clientBuildNode:  __APP_BUILD_NODE__,
    clientBuildVite:  __APP_BUILD_VITE__,
    clientToolchain:  store.clientToolchain,
    backendVersion:   computed(() => store.backend?.version    ?? '…'),
    backendCommit:    computed(() => store.backend?.commit     ?? '…'),
    backendDate:      computed(() => store.backend?.build_time ?? '…'),
    backendBranch:    computed(() => store.backend?.branch     ?? ''),
    backendBuildTime: computed(() => store.backend?.build_time ?? ''),
    backendGoVersion: computed(() => store.backend?.go_version ?? ''),
    backendLoaded:    computed(() => store.backend !== null),
    fetchError:       computed(() => store.fetchError),
  }
}
