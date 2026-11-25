import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AlertRulesModeNotice from '@/components/AlertRulesModeNotice.vue'
import { alertEvaluationMode } from '@/types'

const fetchAlertRules = vi.fn()

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    fetchAlertRules,
    fetchAlertHistory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))

// go-oauth2 #258: the server reports its ALERT_RULES_MODE with the rules as
// evaluation_mode. The Alerts page says when rules do nothing (off) or only
// record (observe), so that no operator relies on a silent rule.
describe('AlertRulesModeNotice', () => {
  it('says that alert rules are not active when the mode is off', () => {
    const text = mount(AlertRulesModeNotice, { props: { mode: 'off' } }).text()
    expect(text).toContain('Alert rules are not active.')
    expect(text).toContain('no alert is raised and no notification is sent')
  })

  it('says that no notification is sent in observe mode', () => {
    const text = mount(AlertRulesModeNotice, { props: { mode: 'observe' } }).text()
    expect(text).toContain('Alert rules run in observe mode.')
    expect(text).toContain('no email, webhook or Slack notification is')
  })

  it('says nothing in enforce mode', () => {
    expect(mount(AlertRulesModeNotice, { props: { mode: 'enforce' } }).text()).toBe('')
  })
})

describe('alertEvaluationMode', () => {
  it('reads evaluation_mode, and anything else as off', () => {
    expect(alertEvaluationMode({ rules: [], evaluation_mode: 'observe' })).toBe('observe')
    expect(alertEvaluationMode({ rules: [], evaluation_mode: 'enforce' })).toBe('enforce')
    expect(alertEvaluationMode({ rules: [], evaluation_mode: 'off' })).toBe('off')
    // A server older than go-oauth2 #258 does not report it, and never evaluates.
    expect(alertEvaluationMode({ rules: [] })).toBe('off')
    expect(alertEvaluationMode({ rules: [], evaluation_mode: 'bogus' as never })).toBe('off')
    expect(alertEvaluationMode(undefined)).toBe('off')
  })
})

describe('Alerts page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchAlertRules.mockReset()
  })

  async function mountPage() {
    const { default: AlertsView } = await import('@/views/AlertsView.vue')
    const wrapper = shallowMount(AlertsView)
    await flushPromises()
    return wrapper
  }

  it.each([
    ['off', 'off'],
    ['observe', 'observe'],
    ['enforce', 'enforce'],
    [undefined, 'off'],
  ])('shows the notice for evaluation_mode %s', async (reported, shown) => {
    fetchAlertRules.mockResolvedValue({ rules: [], evaluation_mode: reported })
    const wrapper = await mountPage()
    const notice = wrapper.findComponent(AlertRulesModeNotice)
    expect(notice.exists()).toBe(true)
    expect(notice.props('mode')).toBe(shown)
  })

  it('shows no notice while the rules have not loaded', async () => {
    fetchAlertRules.mockRejectedValue(new Error('unreachable'))
    const wrapper = await mountPage()
    expect(wrapper.findComponent(AlertRulesModeNotice).exists()).toBe(false)
  })
})
