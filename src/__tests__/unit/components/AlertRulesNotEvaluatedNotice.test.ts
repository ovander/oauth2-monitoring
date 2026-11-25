import { describe, it, expect, vi } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AlertRulesNotEvaluatedNotice from '@/components/AlertRulesNotEvaluatedNotice.vue'

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    fetchAlertRules: vi.fn().mockResolvedValue([]),
    fetchAlertHistory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))

// go-oauth2 #258: the server stores alert rules but does not evaluate them.
// The Alerts page must say so, so that no operator relies on a rule.
describe('AlertRulesNotEvaluatedNotice', () => {
  it('says that alert rules are not evaluated', () => {
    const wrapper = mount(AlertRulesNotEvaluatedNotice)
    const text = wrapper.text()
    expect(text).toContain('Alert rules are not active yet.')
    expect(text).toContain('no alert is raised and no notification is sent')
  })

  it('is rendered on the Alerts page', async () => {
    setActivePinia(createPinia())
    const { default: AlertsView } = await import('@/views/AlertsView.vue')
    const wrapper = shallowMount(AlertsView)
    expect(wrapper.findComponent(AlertRulesNotEvaluatedNotice).exists()).toBe(true)
  })
})
