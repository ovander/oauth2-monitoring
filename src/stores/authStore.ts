import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types'
import { useLogger } from '@/utils/logger'

const log = useLogger('auth')

// Role lists — configurable via env vars (comma-separated). These gate the UI;
// the authoritative boundary is the server-side scope/role check at Socrate.
const ADMIN_ROLES = (import.meta.env.VITE_ADMIN_ROLES || 'admin,monitor_admin')
  .split(',').map((r: string) => r.trim()).filter(Boolean)

const VIEWER_ROLES = (import.meta.env.VITE_VIEWER_ROLES || 'monitor_viewer')
  .split(',').map((r: string) => r.trim()).filter(Boolean)

// Cookie-session auth: the SPA holds NO OAuth tokens. Identity comes from the
// BFF's /bff/session (backed by an HttpOnly cookie the JS cannot read); login,
// logout, and step-up are delegated to the BFF.
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const csrf = ref<string | null>(null)
  const authenticated = ref(false)
  const ready = ref(false) // /bff/session has resolved at least once
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => authenticated.value && !!user.value)

  const isAdmin = computed(() => {
    const roles = user.value?.roles ?? []
    return ADMIN_ROLES.length === 0 || roles.some(r => ADMIN_ROLES.includes(r))
  })

  const isViewer = computed(() => {
    if (isAdmin.value) return true // admin ⊇ viewer
    const roles = user.value?.roles ?? []
    return VIEWER_ROLES.length === 0 || roles.some(r => VIEWER_ROLES.includes(r))
  })

  /** CSRF header for state-changing requests (double-submit; empty if no session). */
  function csrfHeaders(): Record<string, string> {
    return csrf.value ? { 'X-CSRF-Token': csrf.value } : {}
  }

  function setUnauthenticated() {
    authenticated.value = false
    user.value = null
    csrf.value = null
  }

  /** Resolve the current session from the BFF (cookie-based; no token in JS). */
  async function fetchSession(): Promise<void> {
    isLoading.value = true
    try {
      const res = await fetch('/bff/session', {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) {
        setUnauthenticated()
        return
      }
      const data = await res.json()
      if (data?.authenticated) {
        authenticated.value = true
        user.value = (data.user as UserInfo) ?? null
        csrf.value = data.csrf ?? null
        log.debug('session — sub:', user.value?.sub, '| roles:', user.value?.roles)
      } else {
        setUnauthenticated()
      }
    } catch (e) {
      log.warn('session fetch failed:', e)
      setUnauthenticated()
    } finally {
      ready.value = true
      isLoading.value = false
    }
  }

  /** Begin login at the BFF (server-side Authorization Code + PKCE). */
  function login(returnTo?: string): void {
    const rt = returnTo ?? (window.location.pathname + window.location.search)
    window.location.href = `/bff/login?return_to=${encodeURIComponent(rt)}`
  }

  /** Destroy the BFF session. The caller routes to the login view afterwards. */
  async function logout(): Promise<void> {
    try {
      await fetch('/bff/logout', { method: 'POST', credentials: 'include', headers: csrfHeaders() })
    } catch {
      // best effort
    }
    setUnauthenticated()
  }

  /**
   * Step-up (Tier-0 elevation) via the BFF: re-present the password (and MFA, if
   * enrolled). The BFF re-authenticates at Socrate and captures the fresh token
   * into the session server-side — nothing is returned to the browser. Throws an
   * Error whose message is the server's machine code on failure (e.g.
   * 'mfa_required', 'invalid credentials').
   */
  async function elevate(password: string, mfaCode?: string): Promise<void> {
    const res = await fetch('/bff/elevate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ password, mfa_code: mfaCode })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      throw new Error((data as { error?: string }).error || 'Step-up failed')
    }
  }

  return {
    user,
    csrf,
    authenticated,
    ready,
    isLoading,
    error,
    isAuthenticated,
    isAdmin,
    isViewer,
    csrfHeaders,
    fetchSession,
    login,
    logout,
    elevate
  }
})
