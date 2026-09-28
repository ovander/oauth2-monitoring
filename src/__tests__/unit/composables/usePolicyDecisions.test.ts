import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { useApi } from '@/composables/useApi'
import { usePolicyDecisions, toQuery, defaultFilters, PAGE_SIZE } from '@/composables/usePolicyDecisions'
import { mockResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  const auth = useAuthStore()
  auth.authenticated = true
  auth.user = { sub: 'u1', roles: ['monitor_viewer'] }
})

const SUMMARY = {
  mode: 'shadow', policy_version: 4,
  summary: { since: '', denials: 3, enforced_denials: 0, divergences: { pdp_deny_code_allow: 2, pdp_allow_code_deny: 1 }, denials_by_source: { admin_pep: 3 } },
}

function rows(n: number, startId: number) {
  return Array.from({ length: n }, (_, i) => ({ id: startId - i, action: 'a', allow: false, enforced: false, reason: 'denied_by_rule', source: 'admin_pep', mode: 'shadow', policy_version: 4, created_at: '' }))
}

/** Route fetch by path; record every URL. */
function stubFetch(pages: unknown[][]) {
  const urls: string[] = []
  let page = 0
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    urls.push(url)
    if (url.includes('/summary')) return Promise.resolve(mockResponse(SUMMARY))
    return Promise.resolve(mockResponse({ decisions: pages[page++] ?? [], mode: 'shadow' }))
  }))
  return urls
}

describe('toQuery', () => {
  const now = new Date('2026-09-27T12:00:00Z')

  it('defaults to the last 24 hours, one page', () => {
    expect(toQuery(defaultFilters(), now)).toEqual({ limit: PAGE_SIZE, since: '2026-09-26T12:00:00.000Z' })
  })

  it('maps every filter', () => {
    const q = toQuery({ correlationId: '', outcome: 'denied', divergenceOnly: true, source: 'decide_api', clientId: ' billing ', period: '7d' }, now)
    expect(q).toEqual({ limit: PAGE_SIZE, allow: false, divergence: true, source: 'decide_api', client_id: 'billing', since: '2026-09-20T12:00:00.000Z' })
    expect(toQuery({ ...defaultFilters(), outcome: 'allowed' }, now).allow).toBe(true)
    expect(toQuery({ ...defaultFilters(), period: 'all' }, now).since).toBeUndefined()
  })

  it('a correlation id searches all time — a window could hide the one request asked about', () => {
    const q = toQuery({ ...defaultFilters(), correlationId: ' req-9 ', period: '1h' }, now)
    expect(q.correlation_id).toBe('req-9')
    expect(q.since).toBeUndefined()
  })
})

describe('usePolicyDecisions', () => {
  it('loads a page, the mode and the summary', async () => {
    const urls = stubFetch([rows(3, 10)])
    const log = usePolicyDecisions()
    await log.load()
    expect(log.decisions.value).toHaveLength(3)
    expect(log.mode.value).toBe('shadow')
    expect(log.summary.value?.policy_version).toBe(4)
    expect(log.divergenceTotal.value).toBe(3)
    expect(log.exhausted.value).toBe(true)
    expect(urls.some(u => u.startsWith('/api/admin/security/policy-decisions?'))).toBe(true)
    expect(urls.some(u => u.startsWith('/api/admin/security/policy-decisions/summary?since='))).toBe(true)
  })

  it('pages older rows by the last id until a short page', async () => {
    const urls = stubFetch([rows(PAGE_SIZE, 500), rows(2, 400)])
    const log = usePolicyDecisions()
    await log.load()
    expect(log.exhausted.value).toBe(false)
    await log.loadOlder()
    expect(log.decisions.value).toHaveLength(PAGE_SIZE + 2)
    expect(log.exhausted.value).toBe(true)
    expect(urls.find(u => u.includes('before_id='))).toContain(`before_id=${500 - PAGE_SIZE + 1}`)
    // Exhausted: no further request.
    const before = urls.length
    await log.loadOlder()
    expect(urls.length).toBe(before)
  })

  it('surfaces a failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ error: 'forbidden' }, 403)))
    const log = usePolicyDecisions()
    await log.load()
    expect(log.error.value).toMatch(/Failed to fetch policy/)
    expect(log.loading.value).toBe(false)
  })

  it('surfaces a failure while paging', async () => {
    stubFetch([rows(PAGE_SIZE, 500)])
    const log = usePolicyDecisions()
    await log.load()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 500)))
    await log.loadOlder()
    expect(log.error.value).toMatch(/Failed to fetch policy decisions/)
    expect(log.decisions.value).toHaveLength(PAGE_SIZE)
  })

  it('reset restores the default filters', () => {
    const log = usePolicyDecisions()
    log.filters.value.correlationId = 'x'
    log.reset()
    expect(log.filters.value).toEqual(defaultFilters())
  })
})

describe('useApi — policy decisions', () => {
  it('encodes every filter and defaults the mode', async () => {
    let url = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((u: string) => {
      url = u
      return Promise.resolve(mockResponse({}))
    }))
    const res = await useApi().fetchPolicyDecisions({ correlation_id: 'c 1', allow: false, divergence: true, source: 'admin_pep', client_id: 'billing', since: '2026-01-01T00:00:00Z', before_id: 9, limit: 5 })
    expect(res).toEqual({ decisions: [], mode: 'off' })
    const q = new URL(url, 'http://x').searchParams
    expect(q.get('correlation_id')).toBe('c 1')
    expect(q.get('allow')).toBe('false')
    expect(q.get('divergence')).toBe('true')
    expect(q.get('source')).toBe('admin_pep')
    expect(q.get('client_id')).toBe('billing')
    expect(q.get('since')).toBe('2026-01-01T00:00:00Z')
    expect(q.get('before_id')).toBe('9')
    expect(q.get('limit')).toBe('5')
  })

  it('summary: with and without a window; errors throw', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation((u: string) => {
      urls.push(u)
      return Promise.resolve(mockResponse(SUMMARY))
    }))
    const api = useApi()
    await api.fetchPolicySummary()
    await api.fetchPolicySummary('2026-01-01T00:00:00Z')
    expect(urls[0]).toBe('/api/admin/security/policy-decisions/summary')
    expect(urls[1]).toContain('since=2026-01-01T00%3A00%3A00Z')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 500)))
    await expect(api.fetchPolicySummary()).rejects.toThrow(/policy summary/)
  })
})
