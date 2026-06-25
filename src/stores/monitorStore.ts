import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  DashboardStats,
  Activity,
  LoginTrend,
  AppUsage,
  SystemHealth,
  SecurityEvent,
  ThreatMetrics,
  Session,
  TokenStats,
  GeoAnalytics,
  AlertRule,
  TriggeredAlert,
  BlockedIP,
  IPReputation,
  ReportStatus
} from '@/types'

export const useMonitorStore = defineStore('monitor', () => {
  // Dashboard data
  const stats = ref<DashboardStats | null>(null)
  const recentActivity = ref<Activity[]>([])
  const loginTrends = ref<LoginTrend[]>([])
  const appUsage = ref<AppUsage[]>([])
  const health = ref<SystemHealth | null>(null)

  // Security data
  const securityEvents = ref<SecurityEvent[]>([])
  const securityEventsTotal = ref(0)
  const threatMetrics = ref<ThreatMetrics | null>(null)
  const blockedIPs = ref<BlockedIP[]>([])
  const geoAnalytics = ref<GeoAnalytics | null>(null)

  // Sessions
  const sessions = ref<Session[]>([])
  const sessionsTotal = ref(0)

  // Tokens
  const tokenStats = ref<TokenStats | null>(null)

  // Alerts
  const alertRules = ref<AlertRule[]>([])
  const alertHistory = ref<TriggeredAlert[]>([])
  const alertsTotal = ref(0)
  const unacknowledgedAlerts = ref(0)

  // Reports
  const reports = ref<ReportStatus[]>([])

  // Real-time events (SSE)
  const liveEvents = ref<SecurityEvent[]>([])
  const isSSEConnected = ref(false)

  // Loading states
  const isLoading = ref<Record<string, boolean>>({})
  const errors = ref<Record<string, string | null>>({})

  // Computed
  const criticalAlerts = computed(() => 
    alertHistory.value.filter(a => a.severity === 'critical' && !a.acknowledged)
  )

  const threatLevel = computed(() => {
    if (!threatMetrics.value) return 'unknown'
    const { critical_events, error_events } = threatMetrics.value.summary
    if (critical_events > 0) return 'critical'
    if (error_events > 5) return 'high'
    if (error_events > 0) return 'medium'
    return 'low'
  })

  // Actions
  function setLoading(key: string, value: boolean) {
    isLoading.value[key] = value
  }

  function setError(key: string, error: string | null) {
    errors.value[key] = error
  }

  function setStats(data: DashboardStats) {
    stats.value = data
  }

  function setRecentActivity(data: Activity[]) {
    recentActivity.value = data
  }

  function setLoginTrends(data: LoginTrend[]) {
    loginTrends.value = data
  }

  function setAppUsage(data: AppUsage[]) {
    appUsage.value = data
  }

  function setHealth(data: SystemHealth) {
    health.value = data
  }

  function setSecurityEvents(data: SecurityEvent[], total: number) {
    securityEvents.value = data
    securityEventsTotal.value = total
  }

  function setThreatMetrics(data: ThreatMetrics) {
    threatMetrics.value = data
  }

  function setBlockedIPs(data: BlockedIP[]) {
    blockedIPs.value = data
  }

  function addBlockedIP(ip: BlockedIP) {
    blockedIPs.value.unshift(ip)
  }

  function removeBlockedIP(id: number) {
    blockedIPs.value = blockedIPs.value.filter(ip => ip.id !== id)
  }

  function setGeoAnalytics(data: GeoAnalytics) {
    geoAnalytics.value = data
  }

  function setSessions(data: Session[], total: number) {
    sessions.value = data
    sessionsTotal.value = total
  }

  function setTokenStats(data: TokenStats) {
    tokenStats.value = data
  }

  function setAlertRules(data: AlertRule[]) {
    alertRules.value = data
  }

  function addAlertRule(rule: AlertRule) {
    alertRules.value.push(rule)
  }

  function updateAlertRule(rule: AlertRule) {
    const idx = alertRules.value.findIndex(r => r.id === rule.id)
    if (idx !== -1) {
      alertRules.value[idx] = rule
    }
  }

  function removeAlertRule(id: number) {
    alertRules.value = alertRules.value.filter(r => r.id !== id)
  }

  function setAlertHistory(data: TriggeredAlert[], total: number, unack: number) {
    alertHistory.value = data
    alertsTotal.value = total
    unacknowledgedAlerts.value = unack
  }

  function acknowledgeAlert(id: number, note?: string) {
    const alert = alertHistory.value.find(a => a.id === id)
    if (alert) {
      alert.acknowledged = true
      alert.acknowledged_at = new Date().toISOString()
      alert.acknowledge_note = note
      unacknowledgedAlerts.value = Math.max(0, unacknowledgedAlerts.value - 1)
    }
  }

  function addLiveEvent(event: SecurityEvent) {
    liveEvents.value.unshift(event)
    // Keep only last 100 events
    if (liveEvents.value.length > 100) {
      liveEvents.value = liveEvents.value.slice(0, 100)
    }
  }

  function setSSEConnected(connected: boolean) {
    isSSEConnected.value = connected
  }

  function clearLiveEvents() {
    liveEvents.value = []
  }

  function addReport(report: ReportStatus) {
    reports.value.unshift(report)
  }

  function updateReport(report: ReportStatus) {
    const idx = reports.value.findIndex(r => r.report_id === report.report_id)
    if (idx !== -1) {
      reports.value[idx] = report
    }
  }

  return {
    // State
    stats,
    recentActivity,
    loginTrends,
    appUsage,
    health,
    securityEvents,
    securityEventsTotal,
    threatMetrics,
    blockedIPs,
    geoAnalytics,
    sessions,
    sessionsTotal,
    tokenStats,
    alertRules,
    alertHistory,
    alertsTotal,
    unacknowledgedAlerts,
    reports,
    liveEvents,
    isSSEConnected,
    isLoading,
    errors,
    // Computed
    criticalAlerts,
    threatLevel,
    // Actions
    setLoading,
    setError,
    setStats,
    setRecentActivity,
    setLoginTrends,
    setAppUsage,
    setHealth,
    setSecurityEvents,
    setThreatMetrics,
    setBlockedIPs,
    addBlockedIP,
    removeBlockedIP,
    setGeoAnalytics,
    setSessions,
    setTokenStats,
    setAlertRules,
    addAlertRule,
    updateAlertRule,
    removeAlertRule,
    setAlertHistory,
    acknowledgeAlert,
    addLiveEvent,
    setSSEConnected,
    clearLiveEvents,
    addReport,
    updateReport
  }
})
