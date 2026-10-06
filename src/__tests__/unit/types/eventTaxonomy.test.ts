import { describe, it, expect } from 'vitest'
import { EVENT_TYPE_CATEGORIES, EVENT_TYPE_LABELS, EVENT_CATEGORY_LABELS } from '@/types'

// EVENT_TYPE_CATEGORIES is typed Record<SecurityEventType, …>, so TypeScript
// already fails the build when an event type has no category. Labels are a
// plain record: check them here, so no event Socrate emits shows up raw.
describe('security event taxonomy', () => {
  it('labels every event type and every category', () => {
    for (const [type, category] of Object.entries(EVENT_TYPE_CATEGORIES)) {
      expect(EVENT_TYPE_LABELS[type], `label for ${type}`).toBeTruthy()
      expect(EVENT_CATEGORY_LABELS[category], `label for category ${category}`).toBeTruthy()
    }
  })

  it('covers the events Socrate v1.12.0 adds or already emitted without a label', () => {
    for (const type of ['custom_claim_missing', 'custom_claims_dropped', 'admin_app_signin', 'admin_api_audience', 'scope_denied']) {
      expect(EVENT_TYPE_LABELS[type], type).toBeTruthy()
      expect(EVENT_TYPE_CATEGORIES[type as keyof typeof EVENT_TYPE_CATEGORIES], type).toBeTruthy()
    }
  })
})
