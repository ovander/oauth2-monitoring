import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'
import { useStepUpStore } from '@/stores/stepUpStore'
import { mockResponse, mockErrorResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

// Cookie-session auth: the SPA holds no token. Mark the session authenticated
// and give it a CSRF token (as /bff/session would).
function authed(roles = ['admin']) {
  const authStore = useAuthStore()
  authStore.authenticated = true
  authStore.user = { sub: 'u1', roles }
  authStore.csrf = 'csrf-1'
  return authStore
}

// ─── fetchWithAuth ────────────────────────────────────────────────────────────

describe('fetchWithAuth', () => {
  it('sends credentials and Content-Type, never an Authorization header', async () => {
    authed()
    let opts: any
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, o) => {
      opts = o
      return Promise.resolve(mockResponse({ ok: true }))
    }))

    const api = useApi()
    await api.fetchWithAuth('/api/admin/test')

    expect(opts.credentials).toBe('include')
    const h = new Headers(opts.headers)
    expect(h.get('Content-Type')).toBe('application/json')
    expect(h.get('Authorization')).toBeNull()
  })

  it('attaches X-CSRF-Token on mutating requests', async () => {
    authed()
    let opts: any
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, o) => {
      opts = o
      return Promise.resolve(mockResponse({ ok: true }))
    }))

    const api = useApi()
    await api.fetchWithAuth('/api/admin/x', { method: 'POST' })
    expect(new Headers(opts.headers).get('X-CSRF-Token')).toBe('csrf-1')
  })

  it('does not attach CSRF on a GET', async () => {
    authed()
    let opts: any
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, o) => {
      opts = o
      return Promise.resolve(mockResponse({ ok: true }))
    }))

    const api = useApi()
    await api.fetchWithAuth('/api/admin/x')
    expect(new Headers(opts.headers).get('X-CSRF-Token')).toBeNull()
  })

  it('re-authenticates at the BFF on 401 and throws', async () => {
    const authStore = authed()
    const loginSpy = vi.spyOn(authStore, 'login').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockErrorResponse(401)))

    const api = useApi()
    await expect(api.fetchWithAuth('/api/admin/x')).rejects.toThrow('Session expired')
    expect(loginSpy).toHaveBeenCalled()
  })
})

// ─── fetchDashboardStats ──────────────────────────────────────────────────────

describe('fetchDashboardStats', () => {
  it('calls correct URL and sets monitorStore.stats', async () => {
    authed()
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
    authed()
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

// ─── fetchWithAuth — step-up (elevation) ──────────────────────────────────────

describe('fetchWithAuth — step-up', () => {
  it('drives step-up on 403 elevation_required and retries once', async () => {
    authed()
    const stepUp = useStepUpStore()
    const reqSpy = vi.spyOn(stepUp, 'request').mockResolvedValue()

    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) return Promise.resolve(mockResponse({ error: 'elevation_required' }, 403))
      return Promise.resolve(mockResponse({ ok: true }))
    }))

    const api = useApi()
    const res = await api.fetchWithAuth('/api/admin/security/blocked-ips', { method: 'POST' })

    expect(reqSpy).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    expect(call).toBe(2)
  })

  it('does not loop forever if elevation_required persists after one elevation', async () => {
    authed()
    const stepUp = useStepUpStore()
    vi.spyOn(stepUp, 'request').mockResolvedValue()

    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      return Promise.resolve(mockResponse({ error: 'elevation_required' }, 403))
    }))

    const api = useApi()
    const res = await api.fetchWithAuth('/api/admin/x', { method: 'POST' })

    expect(res.status).toBe(403)
    expect(call).toBe(2)
  })

  it('passes through an unrelated 403 without prompting for step-up', async () => {
    authed()
    const stepUp = useStepUpStore()
    const reqSpy = vi.spyOn(stepUp, 'request').mockResolvedValue()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'forbidden' }, 403)))

    const api = useApi()
    const res = await api.fetchWithAuth('/api/admin/x')

    expect(reqSpy).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })
})

// ─── fetchThreatMetrics ───────────────────────────────────────────────────────

describe('fetchThreatMetrics', () => {
  it('sends the `period` query param Socrate expects (not time_range)', async () => {
    authed()
    let calledUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      calledUrl = String(url)
      return Promise.resolve(mockResponse({ time_range: '7d', summary: {}, top_threats: [], suspicious_ips: [], locked_accounts: [] }))
    }))

    const api = useApi()
    await api.fetchThreatMetrics('7d')

    expect(calledUrl).toContain('/api/admin/security/threats?period=7d')
    expect(calledUrl).not.toContain('time_range')
  })
})

// ─── revokeUserTokens ─────────────────────────────────────────────────────────

describe('revokeUserTokens', () => {
  it('POSTs to the user revoke-tokens endpoint', async () => {
    authed()
    let calledUrl = ''
    let calledMethod = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url, opts) => {
      calledUrl = String(url)
      calledMethod = opts?.method
      return Promise.resolve(new Response(null, { status: 200 }))
    }))

    const api = useApi()
    await api.revokeUserTokens(42)

    expect(calledUrl).toContain('/api/admin/users/42/revoke-tokens')
    expect(calledMethod).toBe('POST')
  })
})

// ─── fetchAuditLogs ───────────────────────────────────────────────────────────

describe('fetchAuditLogs', () => {
  it('calls /api/admin/logs and populates the store', async () => {
    authed()
    const monitorStore = useMonitorStore()
    const logsData = {
      logs: [{ id: 1, admin_id: 2, admin_email: 'a@b.c', action: 'unlock_user', target_type: 'user', created_at: '' }],
      total_count: 1,
      page: 1,
      page_size: 25
    }
    let calledUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      calledUrl = String(url)
      return Promise.resolve(mockResponse(logsData))
    }))

    const api = useApi()
    await api.fetchAuditLogs({ action: 'unlock_user' })

    expect(calledUrl).toContain('/api/admin/logs?')
    expect(calledUrl).toContain('action=unlock_user')
    expect(monitorStore.auditLogs).toHaveLength(1)
    expect(monitorStore.auditLogsTotal).toBe(1)
  })
})

// ─── fetchAuditIntegrity ──────────────────────────────────────────────────────

describe('fetchAuditIntegrity', () => {
  it('calls the audit-integrity endpoint with the period', async () => {
    authed()
    let calledUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      calledUrl = String(url)
      return Promise.resolve(mockResponse({
        period: '24h', configured: true, status: 'verified',
        total_events: 10, stamped_events: 10, chained_events: 9,
        coverage_percent: 100, violations: 0, recent_violations: []
      }))
    }))

    const api = useApi()
    const result = await api.fetchAuditIntegrity('24h')

    expect(calledUrl).toContain('/api/admin/security/audit-integrity?period=24h')
    expect(result.status).toBe('verified')
    expect(result.coverage_percent).toBe(100)
  })
})

// ─── blockIP / unblockIP ──────────────────────────────────────────────────────

describe('blockIP', () => {
  it('POSTs to blocked-ips endpoint and adds IP to store', async () => {
    authed()
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
    authed()
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
    authed()
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
