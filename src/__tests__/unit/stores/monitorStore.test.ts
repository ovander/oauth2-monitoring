import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMonitorStore } from '@/stores/monitorStore'
import type { SecurityEvent, ThreatMetrics, TriggeredAlert, BlockedIP, AlertRule } from '@/types'

beforeEach(() => {
  setActivePinia(createPinia())
})

// ─── Loading & Error state ────────────────────────────────────────────────────

describe('setLoading', () => {
  it('sets and unsets loading state by key', () => {
    const store = useMonitorStore()
    store.setLoading('stats', true)
    expect(store.isLoading['stats']).toBe(true)
    store.setLoading('stats', false)
    expect(store.isLoading['stats']).toBe(false)
  })
})

describe('setError', () => {
  it('stores an error message by key', () => {
    const store = useMonitorStore()
    store.setError('events', 'Something went wrong')
    expect(store.errors['events']).toBe('Something went wrong')
  })

  it('clears an error when set to null', () => {
    const store = useMonitorStore()
    store.setError('events', 'oops')
    store.setError('events', null)
    expect(store.errors['events']).toBeNull()
  })
})

// ─── Dashboard setters ────────────────────────────────────────────────────────

describe('setStats', () => {
  it('stores dashboard stats', () => {
    const store = useMonitorStore()
    const stats = { total_users: 100, active_users: 50, total_apps: 5, active_apps: 3, today_logins: 20, today_signups: 2, failed_logins_24h: 5, locked_accounts: 1 }
    store.setStats(stats)
    expect(store.stats).toEqual(stats)
  })
})

describe('setSecurityEvents', () => {
  it('stores events and total', () => {
    const store = useMonitorStore()
    const event = { id: 1, event_type: 'login_failed', severity: 'warning', ip_address: '1.2.3.4', success: false, created_at: '2025-01-01T00:00:00Z' } as SecurityEvent
    store.setSecurityEvents([event], 42)
    expect(store.securityEvents).toHaveLength(1)
    expect(store.securityEventsTotal).toBe(42)
  })
})

// ─── BlockedIP mutations ──────────────────────────────────────────────────────

describe('BlockedIP mutations', () => {
  const ip1: BlockedIP = { id: 1, ip_address: '1.1.1.1', reason: 'spam', blocked_at: '2025-01-01T00:00:00Z', permanent: false }
  const ip2: BlockedIP = { id: 2, ip_address: '2.2.2.2', reason: 'abuse', blocked_at: '2025-01-01T00:00:00Z', permanent: true }

  it('setBlockedIPs replaces the full list', () => {
    const store = useMonitorStore()
    store.setBlockedIPs([ip1, ip2])
    expect(store.blockedIPs).toHaveLength(2)
  })

  it('addBlockedIP prepends to the list', () => {
    const store = useMonitorStore()
    store.setBlockedIPs([ip2])
    store.addBlockedIP(ip1)
    expect(store.blockedIPs[0]!.id).toBe(1)
    expect(store.blockedIPs).toHaveLength(2)
  })

  it('removeBlockedIP filters by id', () => {
    const store = useMonitorStore()
    store.setBlockedIPs([ip1, ip2])
    store.removeBlockedIP(1)
    expect(store.blockedIPs).toHaveLength(1)
    expect(store.blockedIPs[0]!.id).toBe(2)
  })
})

// ─── AlertRule mutations ──────────────────────────────────────────────────────

describe('AlertRule mutations', () => {
  const rule1: AlertRule = { id: 1, name: 'Brute Force', description: '', event_type: 'login_failed', condition: { threshold: 5, window_minutes: 1 }, severity: 'critical', enabled: true, actions: [], created_at: '' }
  const rule2: AlertRule = { id: 2, name: 'Rate Limit', description: '', event_type: 'rate_limit_exceeded', condition: { threshold: 10, window_minutes: 5 }, severity: 'warning', enabled: true, actions: [], created_at: '' }

  it('addAlertRule appends a rule', () => {
    const store = useMonitorStore()
    store.addAlertRule(rule1)
    expect(store.alertRules).toHaveLength(1)
  })

  it('updateAlertRule replaces matching rule by id', () => {
    const store = useMonitorStore()
    store.setAlertRules([rule1, rule2])
    const updated = { ...rule1, name: 'Updated' }
    store.updateAlertRule(updated)
    expect(store.alertRules.find(r => r.id === 1)?.name).toBe('Updated')
  })

  it('updateAlertRule is a no-op for unknown id', () => {
    const store = useMonitorStore()
    store.setAlertRules([rule1])
    store.updateAlertRule({ ...rule2, id: 999 })
    expect(store.alertRules).toHaveLength(1)
  })

  it('removeAlertRule filters by id', () => {
    const store = useMonitorStore()
    store.setAlertRules([rule1, rule2])
    store.removeAlertRule(1)
    expect(store.alertRules.map(r => r.id)).toEqual([2])
  })
})

// ─── acknowledgeAlert ─────────────────────────────────────────────────────────

describe('acknowledgeAlert', () => {
  it('marks alert as acknowledged with note and timestamp', () => {
    const store = useMonitorStore()
    const alert: TriggeredAlert = { id: 10, rule_id: 1, rule_name: 'Test', severity: 'critical', message: 'msg', acknowledged: false, triggered_at: '' }
    store.setAlertHistory([alert], 1, 1)

    store.acknowledgeAlert(10, 'handled by ops')

    const updated = store.alertHistory.find(a => a.id === 10)
    expect(updated?.acknowledged).toBe(true)
    expect(updated?.acknowledge_note).toBe('handled by ops')
    expect(updated?.acknowledged_at).toBeTruthy()
  })

  it('decrements unacknowledgedAlerts counter', () => {
    const store = useMonitorStore()
    const alert: TriggeredAlert = { id: 11, rule_id: 1, rule_name: 'Test', severity: 'warning', message: 'msg', acknowledged: false, triggered_at: '' }
    store.setAlertHistory([alert], 1, 3)

    store.acknowledgeAlert(11)
    expect(store.unacknowledgedAlerts).toBe(2)
  })

  it('does not go below 0 for unacknowledgedAlerts', () => {
    const store = useMonitorStore()
    const alert: TriggeredAlert = { id: 12, rule_id: 1, rule_name: 'Test', severity: 'info', message: 'msg', acknowledged: false, triggered_at: '' }
    store.setAlertHistory([alert], 1, 0) // already 0
    store.acknowledgeAlert(12)
    expect(store.unacknowledgedAlerts).toBe(0)
  })
})

// ─── addLiveEvent ─────────────────────────────────────────────────────────────

describe('addLiveEvent', () => {
  const makeEvent = (id: number): SecurityEvent => ({
    id, event_type: 'login_success', severity: 'info', ip_address: '1.1.1.1', success: true, created_at: ''
  })

  it('prepends event to liveEvents', () => {
    const store = useMonitorStore()
    store.addLiveEvent(makeEvent(1))
    store.addLiveEvent(makeEvent(2))
    expect(store.liveEvents[0]!.id).toBe(2)
    expect(store.liveEvents[1]!.id).toBe(1)
  })

  it('caps liveEvents at 100 items', () => {
    const store = useMonitorStore()
    for (let i = 0; i < 105; i++) store.addLiveEvent(makeEvent(i))
    expect(store.liveEvents.length).toBe(100)
  })
})

// ─── Computed: criticalAlerts ─────────────────────────────────────────────────

describe('criticalAlerts', () => {
  it('returns only unacknowledged critical alerts', () => {
    const store = useMonitorStore()
    const alerts: TriggeredAlert[] = [
      { id: 1, rule_id: 1, rule_name: 'A', severity: 'critical', message: '', acknowledged: false, triggered_at: '' },
      { id: 2, rule_id: 2, rule_name: 'B', severity: 'critical', message: '', acknowledged: true, triggered_at: '' },
      { id: 3, rule_id: 3, rule_name: 'C', severity: 'warning', message: '', acknowledged: false, triggered_at: '' }
    ]
    store.setAlertHistory(alerts, 3, 2)
    expect(store.criticalAlerts).toHaveLength(1)
    expect(store.criticalAlerts[0]!.id).toBe(1)
  })
})

// ─── Computed: threatLevel ────────────────────────────────────────────────────

describe('threatLevel', () => {
  const makeThreat = (critical: number, error: number): ThreatMetrics => ({
    time_range: '24h',
    summary: { total_events: 100, critical_events: critical, error_events: error, warning_events: 0, unique_attackers: 0 },
    top_threats: [],
    suspicious_ips: [],
    locked_accounts: []
  })

  it('returns "unknown" when no metrics loaded', () => {
    const store = useMonitorStore()
    expect(store.threatLevel).toBe('unknown')
  })

  it('returns "critical" when critical_events > 0', () => {
    const store = useMonitorStore()
    store.setThreatMetrics(makeThreat(1, 0))
    expect(store.threatLevel).toBe('critical')
  })

  it('returns "high" when error_events > 5 and no critical', () => {
    const store = useMonitorStore()
    store.setThreatMetrics(makeThreat(0, 6))
    expect(store.threatLevel).toBe('high')
  })

  it('returns "medium" when error_events 1-5 and no critical', () => {
    const store = useMonitorStore()
    store.setThreatMetrics(makeThreat(0, 3))
    expect(store.threatLevel).toBe('medium')
  })

  it('returns "low" when no critical or error events', () => {
    const store = useMonitorStore()
    store.setThreatMetrics(makeThreat(0, 0))
    expect(store.threatLevel).toBe('low')
  })
})
