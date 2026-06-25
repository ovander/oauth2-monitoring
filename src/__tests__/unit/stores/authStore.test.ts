import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { makeJwt, mockResponse, mockErrorResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

// ─── loadStoredConfig ────────────────────────────────────────────────────────

describe('loadStoredConfig', () => {
  it('uses defaults when localStorage is empty', () => {
    const store = useAuthStore()
    expect(store.config.adminUrl).toBe('http://localhost:8081')
    expect(store.config.setupCompleted).toBe(false)
  })

  it('loads stored URLs from localStorage', () => {
    localStorage.setItem('oauth2_monitor_config', JSON.stringify({
      adminUrl: 'https://admin.example.com',
      oauthUrl: 'https://auth.example.com',
      setupCompleted: true
    }))
    const store = useAuthStore()
    expect(store.config.adminUrl).toBe('https://admin.example.com')
    expect(store.config.setupCompleted).toBe(true)
  })

  it('never restores clientSecret from localStorage (SEC-02)', () => {
    localStorage.setItem('oauth2_monitor_config', JSON.stringify({
      adminUrl: 'https://admin.example.com',
      clientSecret: 'supersecret'
    }))
    const store = useAuthStore()
    // clientSecret should be from env (empty string in test env), not from storage
    expect(store.config.clientSecret).toBe('')
  })

  it('handles malformed JSON gracefully', () => {
    localStorage.setItem('oauth2_monitor_config', 'not-valid-json{{{')
    expect(() => useAuthStore()).not.toThrow()
    const store = useAuthStore()
    expect(store.config.adminUrl).toBe('http://localhost:8081')
  })
})

// ─── updateConfig ────────────────────────────────────────────────────────────

describe('updateConfig', () => {
  it('merges new values with existing config', () => {
    const store = useAuthStore()
    store.updateConfig({ adminUrl: 'https://new.example.com' })
    expect(store.config.adminUrl).toBe('https://new.example.com')
    expect(store.config.oauthUrl).toBe('http://localhost:8080') // unchanged
  })

  it('persists config to localStorage (SEC-02: without clientSecret)', () => {
    const store = useAuthStore()
    store.updateConfig({ adminUrl: 'https://new.example.com', clientSecret: 'mysecret' })

    const stored = JSON.parse(localStorage.getItem('oauth2_monitor_config')!)
    expect(stored.adminUrl).toBe('https://new.example.com')
    expect(stored.clientSecret).toBeUndefined()
  })

  it('sets setupCompleted to true when passed', () => {
    const store = useAuthStore()
    store.updateConfig({ setupCompleted: true })
    expect(store.isSetupCompleted).toBe(true)
  })
})

// ─── resetConfig ─────────────────────────────────────────────────────────────

describe('resetConfig', () => {
  it('clears localStorage and resets to defaults', () => {
    const store = useAuthStore()
    store.updateConfig({ adminUrl: 'https://changed.example.com', setupCompleted: true })
    store.resetConfig()

    expect(localStorage.getItem('oauth2_monitor_config')).toBeNull()
    expect(store.config.adminUrl).toBe('http://localhost:8081')
    expect(store.config.setupCompleted).toBe(false)
  })
})

// ─── setTokens ───────────────────────────────────────────────────────────────

describe('setTokens', () => {
  it('stores tokens in-memory only — not in sessionStorage (SEC-04)', () => {
    const store = useAuthStore()
    store.setTokens({
      accessToken: makeJwt({ sub: 'u1', email: 'a@b.com', roles: ['admin'] }),
      expiresIn: 3600,
      tokenType: 'Bearer'
    })

    expect(store.isAuthenticated).toBe(true)
    expect(sessionStorage.getItem('monitor_auth_tokens')).toBeNull()
  })

  it('decodes user info (sub, email, name, roles) from JWT payload', () => {
    const store = useAuthStore()
    const token = makeJwt({ sub: 'user-42', email: 'bob@test.com', name: 'Bob', roles: ['admin'] })
    store.setTokens({ accessToken: token, expiresIn: 3600, tokenType: 'Bearer' })

    expect(store.user?.sub).toBe('user-42')
    expect(store.user?.email).toBe('bob@test.com')
    expect(store.user?.name).toBe('Bob')
    expect(store.user?.roles).toEqual(['admin'])
  })

  it('decodes single role claim (role) into roles array', () => {
    const store = useAuthStore()
    const token = makeJwt({ sub: 'u1', role: 'admin' })
    store.setTokens({ accessToken: token, expiresIn: 3600, tokenType: 'Bearer' })
    expect(store.user?.roles).toEqual(['admin'])
  })

  it('records tokenExpiresAt (CQ-01)', () => {
    const store = useAuthStore()
    const before = Date.now()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1' }), expiresIn: 3600, tokenType: 'Bearer' })
    const after = Date.now()
    expect(store.tokenExpiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(store.tokenExpiresAt).toBeLessThanOrEqual(after + 3600 * 1000)
  })

  it('handles non-JWT accessToken without throwing', () => {
    const store = useAuthStore()
    expect(() =>
      store.setTokens({ accessToken: 'opaque-token', expiresIn: 3600, tokenType: 'Bearer' })
    ).not.toThrow()
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toBeNull()
  })
})

// ─── isAdmin ─────────────────────────────────────────────────────────────────

describe('isAdmin (SEC-03)', () => {
  it('returns true when user has admin role', () => {
    const store = useAuthStore()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1', roles: ['admin'] }), expiresIn: 3600, tokenType: 'Bearer' })
    expect(store.isAdmin).toBe(true)
  })

  it('returns true when user has monitor_admin role', () => {
    const store = useAuthStore()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1', roles: ['monitor_admin'] }), expiresIn: 3600, tokenType: 'Bearer' })
    expect(store.isAdmin).toBe(true)
  })

  it('returns false when user has no recognised admin role', () => {
    const store = useAuthStore()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1', roles: ['viewer'] }), expiresIn: 3600, tokenType: 'Bearer' })
    expect(store.isAdmin).toBe(false)
  })

  it('returns false when not authenticated', () => {
    const store = useAuthStore()
    expect(store.isAdmin).toBe(false)
  })
})

// ─── logout ──────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('clears tokens, user, and expiry from memory', () => {
    const store = useAuthStore()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1', roles: ['admin'] }), expiresIn: 3600, tokenType: 'Bearer' })
    store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.tokenExpiresAt).toBeNull()
    expect(store.getAccessToken()).toBeNull()
  })

  it('clears PKCE and state from sessionStorage', () => {
    sessionStorage.setItem('pkce_verifier', 'abc')
    sessionStorage.setItem('oauth_state', 'xyz')
    const store = useAuthStore()
    store.logout()
    expect(sessionStorage.getItem('pkce_verifier')).toBeNull()
    expect(sessionStorage.getItem('oauth_state')).toBeNull()
  })
})

// ─── getAuthorizationUrlAsync ─────────────────────────────────────────────────

describe('getAuthorizationUrlAsync', () => {
  it('returns a URL with expected OAuth2 parameters', async () => {
    const store = useAuthStore()
    store.updateConfig({ clientId: 'test-client', oauthUrl: 'https://auth.example.com' })
    const url = await store.getAuthorizationUrlAsync()

    expect(url).toContain('https://auth.example.com/oauth/authorize')
    expect(url).toContain('response_type=code')
    expect(url).toContain('client_id=test-client')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain('state=')
    expect(url).toContain('code_challenge=')
  })

  it('stores state and pkce_verifier in sessionStorage', async () => {
    const store = useAuthStore()
    await store.getAuthorizationUrlAsync()
    expect(sessionStorage.getItem('oauth_state')).toBeTruthy()
    expect(sessionStorage.getItem('pkce_verifier')).toBeTruthy()
  })

  it('generates a different state on each call (entropy)', async () => {
    const store = useAuthStore()
    const url1 = await store.getAuthorizationUrlAsync()
    const url2 = await store.getAuthorizationUrlAsync()
    const state1 = new URL(url1).searchParams.get('state')
    const state2 = new URL(url2).searchParams.get('state')
    expect(state1).not.toBe(state2)
  })
})

// ─── exchangeCode ─────────────────────────────────────────────────────────────

describe('exchangeCode', () => {
  it('POSTs to token endpoint and sets tokens in-memory', async () => {
    const store = useAuthStore()
    const accessToken = makeJwt({ sub: 'u1', roles: ['admin'] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      access_token: accessToken,
      refresh_token: 'rt-xyz',
      expires_in: 3600,
      token_type: 'Bearer'
    })))

    await store.exchangeCode('auth-code-123')

    expect(store.isAuthenticated).toBe(true)
    expect(store.getAccessToken()).toBe(accessToken)
    // Verify sessionStorage still does NOT contain the token blob (SEC-04)
    expect(sessionStorage.getItem('monitor_auth_tokens')).toBeNull()
  })

  it('clears pkce_verifier from sessionStorage after exchange', async () => {
    const store = useAuthStore()
    sessionStorage.setItem('pkce_verifier', 'verifier-abc')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      access_token: makeJwt({ sub: 'u1' }),
      expires_in: 3600,
      token_type: 'Bearer'
    })))

    await store.exchangeCode('code')
    expect(sessionStorage.getItem('pkce_verifier')).toBeNull()
  })

  it('sets isLoading before and clears it after', async () => {
    const store = useAuthStore()
    let capturedLoading: boolean | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      capturedLoading = store.isLoading
      return mockResponse({ access_token: makeJwt({ sub: 'u1' }), expires_in: 3600, token_type: 'Bearer' })
    }))

    await store.exchangeCode('code')
    expect(capturedLoading).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('throws and sets error on HTTP error response', async () => {
    const store = useAuthStore()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockErrorResponse(400, { error: 'invalid_grant', error_description: 'Code expired' })
    ))

    await expect(store.exchangeCode('bad-code')).rejects.toThrow('Code expired')
    expect(store.error).toBe('Code expired')
    expect(store.isAuthenticated).toBe(false)
  })
})

// ─── refreshAccessToken ───────────────────────────────────────────────────────

describe('refreshAccessToken', () => {
  it('throws if no refresh token is available', async () => {
    const store = useAuthStore()
    await expect(store.refreshAccessToken()).rejects.toThrow('No refresh token available')
  })

  it('sends refresh_token grant and updates tokens on success', async () => {
    const store = useAuthStore()
    const newToken = makeJwt({ sub: 'u1', roles: ['admin'] })
    store.setTokens({ accessToken: makeJwt({ sub: 'u1' }), refreshToken: 'old-rt', expiresIn: 300, tokenType: 'Bearer' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      access_token: newToken,
      refresh_token: 'new-rt',
      expires_in: 3600,
      token_type: 'Bearer'
    })))

    await store.refreshAccessToken()
    expect(store.getAccessToken()).toBe(newToken)
  })

  it('calls logout and throws on 401 from token endpoint', async () => {
    const store = useAuthStore()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1' }), refreshToken: 'rt', expiresIn: 300, tokenType: 'Bearer' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockErrorResponse(401)))

    await expect(store.refreshAccessToken()).rejects.toThrow('Token refresh failed')
    expect(store.isAuthenticated).toBe(false)
  })

  it('preserves old refreshToken if server does not return a new one', async () => {
    const store = useAuthStore()
    store.setTokens({ accessToken: makeJwt({ sub: 'u1' }), refreshToken: 'preserved-rt', expiresIn: 300, tokenType: 'Bearer' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      access_token: makeJwt({ sub: 'u1' }),
      expires_in: 3600,
      token_type: 'Bearer'
      // no refresh_token in response
    })))

    await store.refreshAccessToken()
    expect(store.tokens?.refreshToken).toBe('preserved-rt')
  })
})
