import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MonitorConfig, AuthTokens, UserInfo } from '@/types'
import { useLogger } from '@/utils/logger'

const log = useLogger('auth')
const STORAGE_KEY = 'oauth2_monitor_config'

// Role lists — configurable via env vars (comma-separated)
// ADMIN_ROLES: full access — block IPs, manage alert rules, acknowledge alerts
// VIEWER_ROLES: read-only access — dashboards, events, reports (no destructive actions)
const ADMIN_ROLES = (import.meta.env.VITE_ADMIN_ROLES || 'admin,monitor_admin')
  .split(',').map((r: string) => r.trim()).filter(Boolean)

const VIEWER_ROLES = (import.meta.env.VITE_VIEWER_ROLES || 'monitor_viewer')
  .split(',').map((r: string) => r.trim()).filter(Boolean)

export const useAuthStore = defineStore('auth', () => {
  // If server URLs are provided via env vars, skip the setup wizard entirely
  const envConfigured = !!(import.meta.env.VITE_ADMIN_URL && import.meta.env.VITE_OAUTH_URL)

  const config = ref<MonitorConfig>({
    adminUrl: import.meta.env.VITE_ADMIN_URL || 'http://localhost:8081',
    oauthUrl: import.meta.env.VITE_OAUTH_URL || 'http://localhost:8080',
    clientId: import.meta.env.VITE_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/callback`,
    scopes: (import.meta.env.VITE_SCOPES || 'openid,profile,email').split(','),
    setupCompleted: envConfigured
  })

  // SEC-04: tokens live in-memory only — never written to sessionStorage
  const tokens = ref<AuthTokens | null>(null)
  const user = ref<UserInfo | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  // CQ-01: track absolute expiry time
  const tokenExpiresAt = ref<number | null>(null)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  const isAuthenticated = computed(() => !!tokens.value?.accessToken)
  const isSetupCompleted = computed(() => config.value.setupCompleted)

  // SEC-03: role checks
  // isAdmin  — can perform destructive actions (block IPs, manage rules, acknowledge alerts)
  // isViewer — read-only access; true for admins too (admin ⊇ viewer)
  const isAdmin = computed(() => {
    const roles = user.value?.roles ?? []
    return ADMIN_ROLES.length === 0 || roles.some(r => ADMIN_ROLES.includes(r))
  })

  const isViewer = computed(() => {
    if (isAdmin.value) return true          // admin has all viewer privileges
    const roles = user.value?.roles ?? []
    return VIEWER_ROLES.length === 0 || roles.some(r => VIEWER_ROLES.includes(r))
  })

  function loadStoredConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Defensive: strip any legacy clientSecret left in storage by older
        // builds — this client is public PKCE and never carries a secret.
        const { clientSecret: _legacy, ...safe } = parsed
        config.value = { ...config.value, ...safe }
      }
    } catch (e) {
      log.error('failed to load config from localStorage:', e)
    }
  }

  function updateConfig(newConfig: Partial<MonitorConfig>) {
    config.value = { ...config.value, ...newConfig }
    // config holds no secret (public PKCE client), so it is safe to persist as-is.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
  }

  function resetConfig() {
    localStorage.removeItem(STORAGE_KEY)
    config.value = {
      adminUrl: import.meta.env.VITE_ADMIN_URL || 'http://localhost:8081',
      oauthUrl: import.meta.env.VITE_OAUTH_URL || 'http://localhost:8080',
      clientId: import.meta.env.VITE_CLIENT_ID || '',
      redirectUri: import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/callback`,
      scopes: (import.meta.env.VITE_SCOPES || 'openid,profile,email').split(','),
      setupCompleted: false
    }
  }

  function setTokens(newTokens: AuthTokens) {
    tokens.value = newTokens

    // CQ-01: track expiry and schedule proactive refresh
    if (newTokens.expiresIn) {
      const expiresAt = Date.now() + newTokens.expiresIn * 1000
      tokenExpiresAt.value = expiresAt
      scheduleRefresh(newTokens.expiresIn)
    }

    // Decode user info from access token (JWT)
    // Try multiple common claim names for roles across different OAuth servers.
    try {
      const parts = newTokens.accessToken.split('.')
      if (parts.length === 3 && parts[1]) {
        const payload = JSON.parse(atob(parts[1]))
        // Extract roles from JWT claims (try common claim names)
        const jwtRoles: string[] =
          (Array.isArray(payload.roles)       ? payload.roles       : null) ??
          (Array.isArray(payload.role)        ? payload.role        : null) ??
          (payload.role   ? [payload.role]        : null) ??
          (Array.isArray(payload.groups)      ? payload.groups      : null) ??
          (Array.isArray(payload.authorities) ? payload.authorities : null) ??
          (Array.isArray(payload.permissions) ? payload.permissions : null) ??
          []
        // Always MERGE with app-specific roles from the token response body.
        // This server returns app_roles: { clientId: role } which is not baked
        // into JWT claims — using ?? would short-circuit on jwtRoles=['user']
        // and never reach rolesFromResponse, so we union them instead.
        const roles = [...new Set([...jwtRoles, ...(newTokens.rolesFromResponse ?? [])])]
        user.value = {
          sub:   payload.sub,
          name:  payload.name ?? payload.preferred_username ?? payload.email,
          email: payload.email,
          roles
        }
        log.debug('JWT decoded — sub:', payload.sub, '| jwtRoles:', jwtRoles, '| merged:', roles)
      }
    } catch (e) {
      log.warn('could not decode access token as JWT:', e)
    }
    // SEC-04: intentionally NOT writing to sessionStorage
  }

  function scheduleRefresh(expiresIn: number) {
    if (refreshTimer) clearTimeout(refreshTimer)
    // Refresh 60s before expiry, minimum 5s
    const delay = Math.max((expiresIn - 60) * 1000, 5000)
    refreshTimer = setTimeout(async () => {
      try {
        await refreshAccessToken()
      } catch {
        // Failed to refresh — user will be redirected on next API call
      }
    }, delay)
  }

  async function getAuthorizationUrlAsync(): Promise<string> {
    const state = generateState()
    sessionStorage.setItem('oauth_state', state)

    const codeVerifier = generateCodeVerifier()
    sessionStorage.setItem('pkce_verifier', codeVerifier)
    const challenge = await generateCodeChallenge(codeVerifier)

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.value.clientId,
      redirect_uri: config.value.redirectUri,
      scope: config.value.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })

    return `${config.value.oauthUrl}/oauth/authorize?${params.toString()}`
  }

  async function exchangeCode(code: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const codeVerifier = sessionStorage.getItem('pkce_verifier')

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.value.redirectUri,
        client_id: config.value.clientId,
        ...(codeVerifier && { code_verifier: codeVerifier })
      })

      // Public PKCE client — no client_secret is ever sent.

      // In dev the Vite proxy forwards /oauth/token → oauthUrl (avoids cross-origin fetch)
      const tokenUrl = import.meta.env.DEV ? '/oauth/token' : `${config.value.oauthUrl}/oauth/token`
      log.debug('exchangeCode → POST', tokenUrl)

      // AbortSignal.timeout covers both the connection and body-reading phases.
      // response.json() may NOT respect a signal passed only to fetch(), so we
      // also race the json() parse against an independent Promise timeout.
      const TIMEOUT_MS = 8_000

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      }).catch((err: unknown) => {
        if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
          throw new Error('Token request timed out while connecting — check server is reachable.')
        }
        throw err
      })

      log.debug('token response status:', response.status)

      // Race body parsing against its own timeout — AbortSignal on fetch() is not
      // guaranteed to abort an in-progress response.json() in all browsers.
      const bodyTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token request timed out — server sent headers but body never arrived. Check server logs.')), TIMEOUT_MS)
      )

      log.debug('reading response body…')
      const data = await Promise.race([
        response.json() as Promise<Record<string, unknown>>,
        bodyTimeout
      ])
      log.debug('token response body keys:', Object.keys(data))
      // Log the role-related fields from the token response to aid diagnosis
      log.debug('token roles (top-level):', data.roles, '| app_roles:', data.app_roles)

      if (!response.ok) {
        throw new Error((data as {error_description?: string}).error_description
          || (data as {error?: string}).error
          || 'Token exchange failed')
      }

      // Merge top-level `roles` and `app_roles` from the response body.
      // `app_roles` may be an array of strings OR an object { clientId: role }
      // mapping each OAuth2 client to the user's role in that application.
      const topLevelRoles: string[] = Array.isArray(data.roles) ? (data.roles as string[]) : []
      let appRoles: string[] = []
      if (Array.isArray(data.app_roles)) {
        appRoles = data.app_roles as string[]
      } else if (data.app_roles && typeof data.app_roles === 'object') {
        // Extract the role for OUR client ID specifically
        const appRole = (data.app_roles as Record<string, string>)[config.value.clientId]
        if (appRole) appRoles = [appRole]
      }
      const rolesFromResponse = [...new Set([...topLevelRoles, ...appRoles])]
      log.debug('rolesFromResponse — top-level:', topLevelRoles, '| app_roles extracted:', appRoles, '→ merged:', rolesFromResponse)

      setTokens({
        accessToken:  data.access_token  as string,
        refreshToken: data.refresh_token as string,
        idToken:      data.id_token      as string,
        expiresIn:    data.expires_in    as number,
        tokenType:    data.token_type    as string,
        rolesFromResponse
      })

      sessionStorage.removeItem('pkce_verifier')
      // oauth_state is cleared in CallbackView before calling exchangeCode
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Authentication failed'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function refreshAccessToken(): Promise<void> {
    if (!tokens.value?.refreshToken) {
      throw new Error('No refresh token available')
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.value.refreshToken,
      client_id: config.value.clientId
    })

    // Public PKCE client — no client_secret is ever sent.

    const tokenUrl = import.meta.env.DEV ? '/oauth/token' : `${config.value.oauthUrl}/oauth/token`
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })

    if (!response.ok) {
      logout()
      throw new Error('Token refresh failed')
    }

    const data = await response.json()
    setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.value.refreshToken,
      idToken: data.id_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type
    })
  }

  // Step-up (Tier-0 elevation): re-present the password (and MFA, if enrolled)
  // to POST /api/admin/elevate and obtain a fresh-auth_time access token, which
  // replaces the current one for destructive admin calls. The refresh token is
  // intentionally preserved (elevation does not start a new session).
  // Throws an Error whose message is the server's machine code on failure
  // (e.g. 'mfa_required', 'invalid credentials').
  async function elevate(password: string, mfaCode?: string): Promise<void> {
    const token = getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const url = `${config.value.adminUrl}/api/admin/elevate`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, mfa_code: mfaCode })
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({} as Record<string, unknown>))
      throw new Error((data as { error?: string }).error || 'Step-up failed')
    }

    const data = await response.json()
    setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.value?.refreshToken,
      idToken: data.id_token || tokens.value?.idToken,
      expiresIn: data.expires_in,
      tokenType: data.token_type
    })
  }

  function logout() {
    tokens.value = null
    user.value = null
    tokenExpiresAt.value = null
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null }
    // Clean up any legacy session storage entries
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('oauth_state')
  }

  function getAccessToken(): string | null {
    return tokens.value?.accessToken || null
  }

  // Initialize — only load config (not tokens; tokens are in-memory only now)
  loadStoredConfig()

  return {
    config,
    tokens,
    user,
    isLoading,
    error,
    tokenExpiresAt,
    isAuthenticated,
    isSetupCompleted,
    isAdmin,
    isViewer,
    loadStoredConfig,
    updateConfig,
    resetConfig,
    setTokens,
    getAuthorizationUrlAsync,
    exchangeCode,
    refreshAccessToken,
    elevate,
    logout,
    getAccessToken
  }
})

// Helper functions

function generateState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

// CQ-02: fixed base64UrlEncode — avoids spread operator stack overflow
function base64UrlEncode(array: Uint8Array): string {
  return btoa(Array.from(array, b => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
