import { describe, it, expect } from 'vitest'
import { reasonLabel, divergenceLabel, sourceLabel, outcome, principalLabel, sinceFromPeriod } from '@/utils/policy'

describe('policy labels', () => {
  it('explains reasons, keeping unmet obligations and unknown codes', () => {
    expect(reasonLabel('no_applicable_rule')).toMatch(/default deny/)
    expect(reasonLabel('subject_locked')).toMatch(/locked/)
    expect(reasonLabel('obligation_unmet:require_fresh_auth')).toBe('Denied — obligation not met (require_fresh_auth)')
    expect(reasonLabel('new_reason')).toBe('new_reason')
  })
  it('explains divergences and sources', () => {
    expect(divergenceLabel('pdp_deny_code_allow')).toMatch(/stricter/)
    expect(divergenceLabel('pdp_allow_code_deny')).toMatch(/looser/)
    expect(divergenceLabel(undefined)).toBe('')
    expect(divergenceLabel('x')).toBe('x')
    expect(sourceLabel('admin_pep')).toBe('Admin API')
    expect(sourceLabel('decide_api')).toBe('Application')
    expect(sourceLabel('other')).toBe('other')
  })
  it('names the outcome: refused, would deny, allowed, no policy', () => {
    expect(outcome({ allow: false, enforced: true, reason: 'denied_by_rule' }).label).toBe('Refused')
    expect(outcome({ allow: false, enforced: false, reason: 'denied_by_rule' }).label).toBe('Would deny')
    expect(outcome({ allow: true, enforced: false, reason: 'allowed_by_rule' }).label).toBe('Allowed')
    expect(outcome({ allow: false, enforced: true, reason: 'policy_unavailable' }).label).toBe('No policy')
  })
  it('says who, including which application asked', () => {
    expect(principalLabel({ source: 'admin_pep', principal_kind: 'user', principal_id: 7 })).toBe('user #7')
    expect(principalLabel({ source: 'decide_api', principal_kind: 'user', principal_id: 7, client_id: 'billing' })).toBe('user #7 via billing')
    expect(principalLabel({ source: 'decide_api', principal_kind: 'client', client_id: 'billing' })).toBe('client billing')
    expect(principalLabel({ source: 'admin_pep' })).toBe('—')
  })
  it('turns a period into an RFC 3339 start, or nothing for all time', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(sinceFromPeriod('1h', now)).toBe('2026-09-27T11:00:00.000Z')
    expect(sinceFromPeriod('24h', now)).toBe('2026-09-26T12:00:00.000Z')
    expect(sinceFromPeriod('7d', now)).toBe('2026-09-20T12:00:00.000Z')
    expect(sinceFromPeriod('all', now)).toBeUndefined()
  })
})
