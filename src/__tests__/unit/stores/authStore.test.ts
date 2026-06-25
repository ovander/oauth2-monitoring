import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { mockResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

// ─── fetchSession ─────────────────────────────────────────────────────────────

describe('fetchSession', () => {
  it('marks authenticated and sets user + csrf from /bff/session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      authenticated: true,
      user: { sub: 'u1', email: 'a@b.c', roles: ['admin'] },
      csrf: 'csrf-1'
    })))

    const s = useAuthStore()
    await s.fetchSession()

    expect(s.isAuthenticated).toBe(true)
    expect(s.user?.email).toBe('a@b.c')
    expect(s.csrf).toBe('csrf-1')
    expect(s.ready).toBe(true)
  })

  it('marks unauthenticated when the BFF says so', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ authenticated: false })))
    const s = useAuthStore()
    await s.fetchSession()
    expect(s.isAuthenticated).toBe(false)
    expect(s.user).toBeNull()
  })

  it('resolves unauthenticated on network error (and still becomes ready)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const s = useAuthStore()
    await s.fetchSession()
    expect(s.isAuthenticated).toBe(false)
    expect(s.ready).toBe(true)
  })
})

// ─── roles ────────────────────────────────────────────────────────────────────

describe('role gating', () => {
  it('admin role → isAdmin and isViewer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      authenticated: true, user: { sub: 'u1', roles: ['monitor_admin'] }, csrf: 'x'
    })))
    const s = useAuthStore()
    await s.fetchSession()
    expect(s.isAdmin).toBe(true)
    expect(s.isViewer).toBe(true)
  })

  it('viewer role → isViewer but not isAdmin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      authenticated: true, user: { sub: 'u1', roles: ['monitor_viewer'] }, csrf: 'x'
    })))
    const s = useAuthStore()
    await s.fetchSession()
    expect(s.isAdmin).toBe(false)
    expect(s.isViewer).toBe(true)
  })
})

// ─── elevate (step-up via the BFF) ────────────────────────────────────────────

describe('elevate', () => {
  it('POSTs to /bff/elevate with credentials + CSRF + body', async () => {
    const s = useAuthStore()
    s.authenticated = true
    s.csrf = 'csrf-1'

    let url = ''
    let opts: any
    vi.stubGlobal('fetch', vi.fn().mockImplementation((u, o) => {
      url = String(u)
      opts = o
      return Promise.resolve(new Response(null, { status: 204 }))
    }))

    await s.elevate('pw', '123456')

    expect(url).toBe('/bff/elevate')
    expect(opts.credentials).toBe('include')
    expect(new Headers(opts.headers).get('X-CSRF-Token')).toBe('csrf-1')
    expect(JSON.parse(opts.body)).toEqual({ password: 'pw', mfa_code: '123456' })
  })

  it('throws the server error code on failure (e.g. mfa_required)', async () => {
    const s = useAuthStore()
    s.csrf = 'x'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'mfa_required' }, 401)))
    await expect(s.elevate('pw')).rejects.toThrow('mfa_required')
  })
})

// ─── logout ───────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('POSTs /bff/logout and clears the session', async () => {
    const s = useAuthStore()
    s.authenticated = true
    s.user = { sub: 'u1', roles: ['admin'] }
    s.csrf = 'x'

    let url = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((u) => {
      url = String(u)
      return Promise.resolve(new Response(null, { status: 204 }))
    }))

    await s.logout()

    expect(url).toBe('/bff/logout')
    expect(s.isAuthenticated).toBe(false)
    expect(s.user).toBeNull()
    expect(s.csrf).toBeNull()
  })
})
