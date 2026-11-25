import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AlertRulesNotEvaluatedNotice from '@/components/AlertRulesNotEvaluatedNotice.vue'
import AlertsViewSource from '@/views/AlertsView.vue?raw'

// go-oauth2 #258: the server stores alert rules but does not evaluate them.
// The Alerts page must say so, so that no operator relies on a rule.
describe('AlertRulesNotEvaluatedNotice', () => {
  it('says that alert rules are not evaluated', () => {
    const wrapper = mount(AlertRulesNotEvaluatedNotice)
    const text = wrapper.text()
    expect(text).toContain('Alert rules are not active yet.')
    expect(text).toContain('no alert is raised and no notification is sent')
  })

  it('is shown on the Alerts page', () => {
    expect(AlertsViewSource).toContain('<AlertRulesNotEvaluatedNotice />')
  })
})
