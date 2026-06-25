import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

// Cookie-session auth: the SPA holds no token. Mark the session authenticated.
function authed() {
  const authStore = useAuthStore()
  authStore.authenticated = true
  authStore.user = { sub: 'u1', roles: ['admin'] }
  return authStore
}

function makeStreamResponse(chunks: string[]): Response {
  let idx = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[idx++]))
      } else {
        controller.close()
      }
    }
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('useSSE — connect / disconnect', () => {
  it('does not attempt connection when not authenticated', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await sse.connect()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('connects same-origin with credentials and no Authorization header', async () => {
    authed()
    let capturedUrl = ''
    let capturedOpts: any = {}
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url, opts) => {
      capturedUrl = String(url)
      capturedOpts = opts
      return Promise.resolve(makeStreamResponse(['event: heartbeat\ndata: ping\n\n']))
    }))

    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await sse.connect()

    expect(capturedUrl).toBe('/api/admin/events/stream')
    expect(capturedOpts.credentials).toBe('include')
    expect(capturedOpts.headers?.Authorization).toBeUndefined()
  })

  it('sets isSSEConnected to true after successful connection', async () => {
    authed()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeStreamResponse(['event: heartbeat\ndata: ping\n\n'])
    ))

    const { useSSE } = await import('@/composables/useSSE')
    const monitorStore = useMonitorStore()
    const sse = useSSE()
    await sse.connect()
    expect(monitorStore.isSSEConnected).toBe(true)
  })

  it('sets isSSEConnected to false after disconnect', async () => {
    authed()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeStreamResponse(['event: heartbeat\ndata: ping\n\n'])
    ))

    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await sse.connect()
    sse.disconnect()
    expect(useMonitorStore().isSSEConnected).toBe(false)
  })
})

describe('useSSE — processEvent', () => {
  it('adds security_event to monitorStore.liveEvents', async () => {
    authed()
    const secEvent = { id: 1, event_type: 'login_failed', severity: 'warning', ip_address: '1.2.3.4', success: false, created_at: '' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeStreamResponse([`event: security_event\ndata: ${JSON.stringify(secEvent)}\n\n`])
    ))

    const { useSSE } = await import('@/composables/useSSE')
    const monitorStore = useMonitorStore()
    const sse = useSSE()
    await sse.connect()
    expect(monitorStore.liveEvents.length).toBeGreaterThan(0)
    expect(monitorStore.liveEvents[0]!.id).toBe(1)
  })

  it('does not throw on malformed JSON data', async () => {
    authed()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeStreamResponse(['event: security_event\ndata: {invalid json\n\n'])
    ))

    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await expect(sse.connect()).resolves.not.toThrow()
  })
})
