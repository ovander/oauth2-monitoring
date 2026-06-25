import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { mockResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

// End-to-end of the cookie-session model: the SPA never holds a token — it
// bootstraps identity from the BFF and delegates login/logout/step-up to it.
describe('cookie-session auth flow', () => {
  it('bootstraps an authenticated session from /bff/session and gates by role', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      authenticated: true,
      user: { sub: 'u1', email: 'admin@socrate', roles: ['admin'] },
      csrf: 'csrf-1'
    })))

    const s = useAuthStore()
    await s.fetchSession()

    expect(s.isAuthenticated).toBe(true)
    expect(s.isAdmin).toBe(true)
    expect(s.csrf).toBe('csrf-1')
  })

  it('an unauthenticated bootstrap leaves the user logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ authenticated: false })))
    const s = useAuthStore()
    await s.fetchSession()
    expect(s.isAuthenticated).toBe(false)
  })

  it('logout clears the session', async () => {
    const s = useAuthStore()
    s.authenticated = true
    s.user = { sub: 'u1', roles: ['admin'] }
    s.csrf = 'csrf-1'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await s.logout()

    expect(s.isAuthenticated).toBe(false)
    expect(s.csrf).toBeNull()
  })
})
