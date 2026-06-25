import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'
import { makeJwt, mockResponse, mockErrorResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

function loginStore(roles = ['admin']) {
  const authStore = useAuthStore()
  authStore.setTokens({
    accessToken: makeJwt({ sub: 'u1', roles }),
    refreshToken: 'rt-123',
    expiresIn: 3600,
    tokenType: 'Bearer'
  })
  return authStore
}

// ─── fetchWithAuth ────────────────────────────────────────────────────────────

describe('fetchWithAuth', () => {
  it('throws "Not authenticated" when no token is available', async () => {
    const api = useApi()
    await expect(api.fetchWithAuth('https://example.com/api')).rejects.toThrow('Not authenticated')
  })

  it('adds Authorization Bearer header and Content-Type', async () => {
    loginStore()
    const api = useApi()
    const authStore = useAuthStore()
    const token = authStore.getAccessToken()!

    let capturedHeaders: Headers | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedHeaders = new Headers(opts.headers)
      return Promise.resolve(mockResponse({ ok: true }))
    }))

    await api.fetchWithAuth('https://example.com/api/test')
    expect(capturedHeaders?.get('Authorization')).toBe(`Bearer ${token}`)
    expect(capturedHeaders?.get('Content-Type')).toBe('application/json')
  })

  it('retries once with new token on 401 (SEC-05)', async () => {
    loginStore()
    const authStore = useAuthStore()
    const newToken = makeJwt({ sub: 'u1', roles: ['admin'] })

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      callCount++
      if (callCount === 1) return Promise.resolve(mockErrorResponse(401))
      // Simulate refresh endpoint
      if (String(_url).includes('/oauth/token')) {
        return Promise.resolve(mockResponse({ access_token: newToken, refresh_token: 'new-rt', expires_in: 3600, token_type: 'Bearer' }))
      }
      return Promise.resolve(mockResponse({ success: true }))
    }))

    const api = useApi()
    const response = await api.fetchWithAuth(`${authStore.config.adminUrl}/api/test`)
    expect(response.ok).toBe(true)
    // fetch was called: original attempt + refresh + retry = 3
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  it('does NOT retry again if retry also gets 401 — no infinite recursion (SEC-05)', async () => {
    loginStore()
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url) => {
      callCount++
      // Always return 401 (refresh also fails with 401 for token endpoint)
      return Promise.resolve(mockErrorResponse(401))
    }))

    const api = useApi()
    await expect(api.fetchWithAuth('https://example.com/api/test')).rejects.toThrow()
    // Should not recurse infinitely — call count must be bounded
    expect(callCount).toBeLessThan(10)
  })

  it('logs out and throws on refresh failure', async () => {
    loginStore()
    const authStore = useAuthStore()

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url) => {
      // Both original and refresh calls fail
      return Promise.resolve(mockErrorResponse(401))
    }))

    const api = useApi()
    await expect(api.fetchWithAuth(`${authStore.config.adminUrl}/api/test`)).rejects.toThrow()
    expect(authStore.isAuthenticated).toBe(false)
  })
})

// ─── fetchDashboardStats ──────────────────────────────────────────────────────

describe('fetchDashboardStats', () => {
  it('calls correct URL and sets monitorStore.stats', async () => {
    const authStore = loginStore()
    const monitorStore = useMonitorStore()
    const statsData = { total_users: 50, active_users: 30, total_apps: 3, active_apps: 2, today_logins: 10, today_signups: 1, failed_logins_24h: 2, locked_accounts: 0 }

    let calledUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      calledUrl = String(url)
      return Promise.resolve(mockResponse(statsData))
    }))

    const api = useApi()
    const result = await api.fetchDashboardStats()

    expect(calledUrl).toContain('/api/admin/dashboard/stats')
    expect(monitorStore.stats).toEqual(statsData)
    expect(result).toEqual(statsData)
  })

  it('sets and clears loading state (stats)', async () => {
    loginStore()
    const monitorStore = useMonitorStore()
    let loadingDuring = false

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      loadingDuring = !!monitorStore.isLoading['stats']
      return mockResponse({ total_users: 0, active_users: 0, total_apps: 0, active_apps: 0, today_logins: 0, today_signups: 0, failed_logins_24h: 0, locked_accounts: 0 })
    }))

    const api = useApi()
    await api.fetchDashboardStats()

    expect(loadingDuring).toBe(true)
    expect(monitorStore.isLoading['stats']).toBe(false)
  })
})

// ─── blockIP / unblockIP ──────────────────────────────────────────────────────

describe('blockIP', () => {
  it('POSTs to blocked-ips endpoint and adds IP to store', async () => {
    loginStore()
    const monitorStore = useMonitorStore()
    const newIp = { id: 99, ip_address: '10.0.0.1', reason: 'scanner', blocked_at: '', permanent: false }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(newIp)))

    const api = useApi()
    await api.blockIP({ ip_address: '10.0.0.1', reason: 'scanner' })

    expect(monitorStore.blockedIPs[0]).toEqual(newIp)
  })
})

describe('unblockIP', () => {
  it('DELETEs from blocked-ips endpoint and removes IP from store', async () => {
    loginStore()
    const monitorStore = useMonitorStore()
    monitorStore.setBlockedIPs([{ id: 5, ip_address: '5.5.5.5', reason: 'spam', blocked_at: '', permanent: false }])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const api = useApi()
    await api.unblockIP(5)

    expect(monitorStore.blockedIPs).toHaveLength(0)
  })
})

// ─── acknowledgeAlert ─────────────────────────────────────────────────────────

describe('acknowledgeAlert', () => {
  it('POSTs to acknowledge endpoint and updates store', async () => {
    loginStore()
    const monitorStore = useMonitorStore()
    monitorStore.setAlertHistory([
      { id: 7, rule_id: 1, rule_name: 'Test', severity: 'critical', message: 'msg', acknowledged: false, triggered_at: '' }
    ], 1, 1)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const api = useApi()
    await api.acknowledgeAlert(7, 'handled')

    expect(monitorStore.alertHistory.find(a => a.id === 7)?.acknowledged).toBe(true)
  })
})
