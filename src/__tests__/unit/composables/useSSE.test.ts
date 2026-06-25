import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'
import { makeJwt } from '@/__tests__/helpers'

// We test the SSE logic directly by importing and instantiating the composable
// in an app context (needed for onUnmounted lifecycle)
import { createApp, defineComponent, h } from 'vue'
import { createPinia as createFreshPinia } from 'pinia'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

function loginStore() {
  const authStore = useAuthStore()
  authStore.setTokens({
    accessToken: makeJwt({ sub: 'u1', roles: ['admin'] }),
    expiresIn: 3600,
    tokenType: 'Bearer'
  })
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
  it('does not attempt connection when no access token', async () => {
    // No login — authStore has no token
    // vi.stubGlobal returns the original value, so keep the spy reference separately
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await sse.connect()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends Authorization header when connecting', async () => {
    loginStore()
    const authStore = useAuthStore()
    const token = authStore.getAccessToken()!

    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers
      return Promise.resolve(makeStreamResponse(['event: heartbeat\ndata: ping\n\n']))
    }))

    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await sse.connect()
    expect(capturedHeaders['Authorization']).toBe(`Bearer ${token}`)
  })

  it('sets isSSEConnected to true after successful connection', async () => {
    loginStore()
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
    loginStore()
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
    loginStore()
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
    loginStore()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeStreamResponse(['event: security_event\ndata: {invalid json\n\n'])
    ))

    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE()
    await expect(sse.connect()).resolves.not.toThrow()
  })
})
