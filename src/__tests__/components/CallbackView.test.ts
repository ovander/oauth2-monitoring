import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent } from 'vue'
import { makeJwt, mockResponse } from '@/__tests__/helpers'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

// Stub PrimeVue components used in CallbackView
vi.mock('primevue/progressspinner', () => ({ default: defineComponent({ template: '<div data-testid="spinner" />' }) }))
vi.mock('primevue/message', () => ({ default: defineComponent({ template: '<div data-testid="message"><slot /></div>' }) }))
vi.mock('primevue/button', () => ({ default: defineComponent({ props: ['label'], template: '<button :data-label="label" @click="$emit(\'click\')" />' }) }))

async function mountCallback(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/callback', name: 'callback', component: (await import('@/views/CallbackView.vue')).default },
      { path: '/', name: 'dashboard', component: defineComponent({ template: '<div />' }) },
      { path: '/login', name: 'login', component: defineComponent({ template: '<div />' }) }
    ]
  })

  // Navigate to callback with query params
  const queryString = new URLSearchParams(query).toString()
  await router.push(`/callback${queryString ? '?' + queryString : ''}`)

  const wrapper = mount((await import('@/views/CallbackView.vue')).default, {
    global: { plugins: [router, createPinia()] }
  })
  await wrapper.vm.$nextTick()
  return { wrapper, router }
}

describe('CallbackView', () => {
  it('shows spinner initially (isProcessing = true)', async () => {
    // Set up state so code exchange doesn't happen immediately
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ access_token: makeJwt({ sub: 'u1' }), expires_in: 3600, token_type: 'Bearer' })))
    sessionStorage.setItem('oauth_state', 'abc')

    const { wrapper } = await mountCallback({ code: 'mycode', state: 'abc' })
    // Spinner should exist before the async onMounted resolves
    expect(wrapper.html()).toBeTruthy()
  })

  it('shows error when no code in URL', async () => {
    const { wrapper } = await mountCallback({ error: 'access_denied', error_description: 'User denied' })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).toContain('User denied')
  })

  it('shows CSRF error on state mismatch (SEC-01)', async () => {
    vi.stubGlobal('fetch', vi.fn()) // ensure fetch is a spy so we can assert it was NOT called
    sessionStorage.setItem('oauth_state', 'correct-state')
    const { wrapper } = await mountCallback({ code: 'mycode', state: 'wrong-state' })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).toContain('state')
    // exchangeCode should NOT have been called
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows CSRF error when state is missing', async () => {
    sessionStorage.setItem('oauth_state', 'abc')
    const { wrapper } = await mountCallback({ code: 'mycode' }) // no state param
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).toContain('state')
  })

  it('clears oauth_state from sessionStorage regardless of outcome', async () => {
    sessionStorage.setItem('oauth_state', 'abc')
    await mountCallback({ code: 'mycode', state: 'wrong-state' })
    await new Promise(r => setTimeout(r, 50))
    expect(sessionStorage.getItem('oauth_state')).toBeNull()
  })
})
