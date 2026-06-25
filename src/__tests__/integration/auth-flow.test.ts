import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { useApi } from '@/composables/useApi'
import { makeJwt, mockResponse, mockErrorResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

// ─── Full PKCE Flow ───────────────────────────────────────────────────────────

describe('Full PKCE OAuth2 Flow', () => {
  it('generates authorization URL with state + PKCE verifier in sessionStorage', async () => {
    const authStore = useAuthStore()
    authStore.updateConfig({ clientId: 'test-client', oauthUrl: 'https://auth.example.com', setupCompleted: true })

    const url = await authStore.getAuthorizationUrlAsync()

    expect(sessionStorage.getItem('oauth_state')).toBeTruthy()
    expect(sessionStorage.getItem('pkce_verifier')).toBeTruthy()

    const parsed = new URL(url)
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    expect(parsed.searchParams.get('state')).toBe(sessionStorage.getItem('oauth_state'))
  })

  it('exchanges code for tokens stored IN-MEMORY ONLY (SEC-04)', async () => {
    const authStore = useAuthStore()
    const accessToken = makeJwt({ sub: 'user-1', email: 'admin@test.com', roles: ['admin'] })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      access_token: accessToken,
      refresh_token: 'refresh-abc',
      expires_in: 3600,
      token_type: 'Bearer'
    })))

    await authStore.exchangeCode('auth-code')

    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.getAccessToken()).toBe(accessToken)
    expect(authStore.user?.email).toBe('admin@test.com')
    expect(authStore.user?.roles).toContain('admin')

    // Critical: tokens must NOT be in sessionStorage
    expect(sessionStorage.getItem('monitor_auth_tokens')).toBeNull()
  })

  it('pkce_verifier is cleared from sessionStorage after code exchange', async () => {
    const authStore = useAuthStore()
    sessionStorage.setItem('pkce_verifier', 'my-verifier')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      access_token: makeJwt({ sub: 'u1' }),
      expires_in: 3600,
      token_type: 'Bearer'
    })))

    await authStore.exchangeCode('code')
    expect(sessionStorage.getItem('pkce_verifier')).toBeNull()
  })
})

// ─── After Authentication ─────────────────────────────────────────────────────

describe('Post-authentication state', () => {
  function loginUser(roles = ['admin']) {
    const authStore = useAuthStore()
    authStore.setTokens({
      accessToken: makeJwt({ sub: 'u1', email: 'test@test.com', roles }),
      refreshToken: 'rt-xyz',
      expiresIn: 3600,
      tokenType: 'Bearer'
    })
    return authStore
  }

  it('isAuthenticated is true after login', () => {
    const authStore = loginUser()
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('isAdmin is true when user has admin role', () => {
    const authStore = loginUser(['admin'])
    expect(authStore.isAdmin).toBe(true)
  })

  it('isAdmin is false for non-admin role', () => {
    const authStore = loginUser(['viewer'])
    expect(authStore.isAdmin).toBe(false)
  })

  it('fetchWithAuth includes Authorization header', async () => {
    const authStore = loginUser()
    const token = authStore.getAccessToken()!

    let capturedAuth = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedAuth = new Headers(opts.headers).get('Authorization') || ''
      return Promise.resolve(mockResponse({ data: true }))
    }))

    const api = useApi()
    await api.fetchWithAuth(`${authStore.config.adminUrl}/api/admin/dashboard/stats`)
    expect(capturedAuth).toBe(`Bearer ${token}`)
  })
})

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('Logout', () => {
  it('clears all auth state from memory', () => {
    const authStore = useAuthStore()
    authStore.setTokens({ accessToken: makeJwt({ sub: 'u1' }), expiresIn: 3600, tokenType: 'Bearer' })
    authStore.logout()

    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.user).toBeNull()
    expect(authStore.getAccessToken()).toBeNull()
    expect(authStore.tokenExpiresAt).toBeNull()
  })

  it('does not write token to sessionStorage on login and leaves nothing on logout', () => {
    const authStore = useAuthStore()
    authStore.setTokens({ accessToken: makeJwt({ sub: 'u1' }), expiresIn: 3600, tokenType: 'Bearer' })
    expect(sessionStorage.getItem('monitor_auth_tokens')).toBeNull()

    authStore.logout()
    expect(sessionStorage.getItem('monitor_auth_tokens')).toBeNull()
  })
})

// ─── clientSecret isolation ───────────────────────────────────────────────────

describe('Client secret isolation (SEC-02)', () => {
  it('never persists clientSecret to localStorage', () => {
    const authStore = useAuthStore()
    authStore.updateConfig({
      clientId: 'my-app',
      clientSecret: 'super-secret',
      adminUrl: 'https://admin.example.com'
    })

    const stored = JSON.parse(localStorage.getItem('oauth2_monitor_config')!)
    expect(stored.clientSecret).toBeUndefined()
    expect(stored.clientId).toBe('my-app')
  })

  it('keeps clientSecret in-memory for the session', () => {
    const authStore = useAuthStore()
    authStore.updateConfig({ clientSecret: 'in-memory-secret' })
    expect(authStore.config.clientSecret).toBe('in-memory-secret')
  })
})
