import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'
import { useStepUpStore } from '@/stores/stepUpStore'
import type {
  DashboardStats,
  ActivityResponse,
  LoginTrendsResponse,
  AppUsageResponse,
  SystemHealth,
  SecurityEventsResponse,
  ThreatMetrics,
  SessionsResponse,
  TokenStats,
  GeoAnalytics,
  AlertRulesResponse,
  AlertHistoryResponse,
  AlertRule,
  BlockedIPsResponse,
  BlockedIP,
  IPReputation,
  ReportRequest,
  ReportStatus,
  AdminAuditLogsResponse,
  AuditIntegrity
} from '@/types'

export function useApi() {
  const authStore = useAuthStore()
  const monitorStore = useMonitorStore()
  const stepUp = useStepUpStore()

  // Cookie-session auth: requests are same-origin and carry the BFF session
  // cookie (credentials: 'include'); the BFF injects the access token. No bearer
  // token is ever held or sent by the SPA. State-changing requests carry the
  // CSRF double-submit header. `elevated` prevents infinite step-up recursion.
  async function fetchWithAuth(
    url: string,
    options: RequestInit = {},
    elevated = false
  ): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase()
    const mutating = method !== 'GET' && method !== 'HEAD'

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(mutating ? authStore.csrfHeaders() : {}),
        ...options.headers
      }
    })

    // No (or expired) session — re-authenticate at the BFF.
    if (response.status === 401) {
      authStore.login()
      throw new Error('Session expired')
    }

    // Tier-0 step-up: a destructive endpoint requires a recent authentication.
    // Drive the elevation dialog (which re-auths via the BFF), then retry once.
    // Concurrent calls coalesce onto one elevation.
    if (response.status === 403 && !elevated) {
      const body = await response.clone().json().catch(() => null)
      if (body && body.error === 'elevation_required') {
        await stepUp.request()
        return fetchWithAuth(url, options, true)
      }
    }

    return response
  }

  // All admin-API calls are same-origin (Caddy → BFF); no host prefix.
  function getBaseUrl(): string {
    return ''
  }

  async function fetchDashboardStats(): Promise<DashboardStats> {
    monitorStore.setLoading('stats', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/dashboard/stats`)
      if (!response.ok) throw new Error('Failed to fetch stats')
      const data = await response.json()
      monitorStore.setStats(data)
      return data
    } finally {
      monitorStore.setLoading('stats', false)
    }
  }

  async function fetchRecentActivity(limit = 20): Promise<ActivityResponse> {
    monitorStore.setLoading('activity', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/dashboard/activity?limit=${limit}`)
      if (!response.ok) throw new Error('Failed to fetch activity')
      const data = await response.json()
      monitorStore.setRecentActivity(data.activities || [])
      return data
    } finally {
      monitorStore.setLoading('activity', false)
    }
  }

  async function fetchLoginTrends(days = 30): Promise<LoginTrendsResponse> {
    monitorStore.setLoading('trends', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/dashboard/login-trends?days=${days}`)
      if (!response.ok) throw new Error('Failed to fetch trends')
      const data = await response.json()
      monitorStore.setLoginTrends(data.trends || [])
      return data
    } finally {
      monitorStore.setLoading('trends', false)
    }
  }

  async function fetchAppUsage(): Promise<AppUsageResponse> {
    monitorStore.setLoading('appUsage', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/dashboard/app-usage`)
      if (!response.ok) throw new Error('Failed to fetch app usage')
      const data = await response.json()
      monitorStore.setAppUsage(data.apps || [])
      return data
    } finally {
      monitorStore.setLoading('appUsage', false)
    }
  }

  async function fetchHealth(): Promise<SystemHealth> {
    monitorStore.setLoading('health', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/dashboard/health`)
      if (!response.ok) throw new Error('Failed to fetch health')
      const data = await response.json()
      monitorStore.setHealth(data)
      return data
    } finally {
      monitorStore.setLoading('health', false)
    }
  }

  async function fetchSecurityEvents(params: {
    event_type?: string
    severity?: string
    user_id?: number
    app_id?: number
    ip_address?: string
    success?: boolean
    from?: string
    to?: string
    page?: number
    page_size?: number
  } = {}): Promise<SecurityEventsResponse> {
    monitorStore.setLoading('events', true)
    try {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, String(value))
        }
      })
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/events?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch events')
      const data = await response.json()
      monitorStore.setSecurityEvents(data.events || [], data.total || 0)
      return data
    } finally {
      monitorStore.setLoading('events', false)
    }
  }

  async function fetchThreatMetrics(timeRange = '24h'): Promise<ThreatMetrics> {
    monitorStore.setLoading('threats', true)
    try {
      // Socrate reads the `period` query parameter (15m|1h|24h|7d|30d).
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/threats?period=${timeRange}`)
      if (!response.ok) throw new Error('Failed to fetch threats')
      const data = await response.json()
      monitorStore.setThreatMetrics(data)
      return data
    } finally {
      monitorStore.setLoading('threats', false)
    }
  }

  async function fetchSessions(params: {
    user_id?: number
    app_id?: number
    page?: number
    page_size?: number
  } = {}): Promise<SessionsResponse> {
    monitorStore.setLoading('sessions', true)
    try {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/sessions?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch sessions')
      const data = await response.json()
      monitorStore.setSessions(data.sessions || [], data.total || 0)
      return data
    } finally {
      monitorStore.setLoading('sessions', false)
    }
  }

  // Socrate has no per-session revocation endpoint — "sessions" are derived from
  // the security audit log, not a stored session table. The correct OAuth 2.1
  // action is to revoke every token for the underlying user, which terminates
  // all of their active sessions across apps.
  async function revokeUserTokens(userId: number): Promise<void> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/users/${userId}/revoke-tokens`, {
      method: 'POST'
    })
    if (!response.ok) throw new Error('Failed to revoke user tokens')
  }

  async function fetchTokenStats(period = '24h'): Promise<TokenStats> {
    monitorStore.setLoading('tokenStats', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/tokens/stats?period=${period}`)
      if (!response.ok) throw new Error('Failed to fetch token stats')
      const data = await response.json()
      monitorStore.setTokenStats(data)
      return data
    } finally {
      monitorStore.setLoading('tokenStats', false)
    }
  }

  async function fetchAuditIntegrity(period = '24h'): Promise<AuditIntegrity> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/audit-integrity?period=${period}`)
    if (!response.ok) throw new Error('Failed to fetch audit integrity')
    return response.json()
  }

  async function fetchGeoAnalytics(period = '24h'): Promise<GeoAnalytics> {
    monitorStore.setLoading('geo', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/geo?period=${period}`)
      if (!response.ok) throw new Error('Failed to fetch geo analytics')
      const data = await response.json()
      monitorStore.setGeoAnalytics(data)
      return data
    } finally {
      monitorStore.setLoading('geo', false)
    }
  }

  async function fetchAlertRules(): Promise<AlertRulesResponse> {
    monitorStore.setLoading('alertRules', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/alerts/rules`)
      if (!response.ok) throw new Error('Failed to fetch alert rules')
      const data = await response.json()
      monitorStore.setAlertRules(data.rules || [])
      return data
    } finally {
      monitorStore.setLoading('alertRules', false)
    }
  }

  async function createAlertRule(rule: Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>): Promise<AlertRule> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/alerts/rules`, {
      method: 'POST',
      body: JSON.stringify(rule)
    })
    if (!response.ok) throw new Error('Failed to create alert rule')
    const data = await response.json()
    monitorStore.addAlertRule(data)
    return data
  }

  async function updateAlertRule(id: number, rule: Partial<AlertRule>): Promise<AlertRule> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/alerts/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rule)
    })
    if (!response.ok) throw new Error('Failed to update alert rule')
    const data = await response.json()
    monitorStore.updateAlertRule(data)
    return data
  }

  async function deleteAlertRule(id: number): Promise<void> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/alerts/rules/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) throw new Error('Failed to delete alert rule')
    monitorStore.removeAlertRule(id)
  }

  async function fetchAlertHistory(params: {
    rule_id?: number
    severity?: string
    acknowledged?: boolean
    from?: string
    to?: string
    page?: number
    page_size?: number
  } = {}): Promise<AlertHistoryResponse> {
    monitorStore.setLoading('alertHistory', true)
    try {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/alerts/history?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch alert history')
      const data = await response.json()
      monitorStore.setAlertHistory(data.alerts || [], data.total || 0, data.unacknowledged || 0)
      return data
    } finally {
      monitorStore.setLoading('alertHistory', false)
    }
  }

  async function acknowledgeAlert(id: number, note?: string): Promise<void> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/alerts/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ note })
    })
    if (!response.ok) throw new Error('Failed to acknowledge alert')
    monitorStore.acknowledgeAlert(id, note)
  }

  async function fetchBlockedIPs(): Promise<BlockedIPsResponse> {
    monitorStore.setLoading('blockedIPs', true)
    try {
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/blocked-ips`)
      if (!response.ok) throw new Error('Failed to fetch blocked IPs')
      const data = await response.json()
      monitorStore.setBlockedIPs(data.blocked_ips || [])
      return data
    } finally {
      monitorStore.setLoading('blockedIPs', false)
    }
  }

  async function blockIP(params: {
    ip_address: string
    reason: string
    duration_hours?: number
    permanent?: boolean
  }): Promise<BlockedIP> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/blocked-ips`, {
      method: 'POST',
      body: JSON.stringify(params)
    })
    if (!response.ok) throw new Error('Failed to block IP')
    const data = await response.json()
    monitorStore.addBlockedIP(data)
    return data
  }

  async function unblockIP(id: number): Promise<void> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/blocked-ips/${id}`, {
      method: 'DELETE'
    })
    if (!response.ok) throw new Error('Failed to unblock IP')
    monitorStore.removeBlockedIP(id)
  }

  async function fetchIPReputation(ip: string): Promise<IPReputation> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/security/ip-reputation/${encodeURIComponent(ip)}`)
    if (!response.ok) throw new Error('Failed to fetch IP reputation')
    return response.json()
  }

  async function generateReport(request: ReportRequest): Promise<ReportStatus> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/reports/security`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
    if (!response.ok) throw new Error('Failed to generate report')
    const data = await response.json()
    monitorStore.addReport(data)
    return data
  }

  async function fetchReportStatus(reportId: string): Promise<ReportStatus> {
    const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/reports/${reportId}`)
    if (!response.ok) throw new Error('Failed to fetch report status')
    const data = await response.json()
    monitorStore.updateReport(data)
    return data
  }

  function getReportDownloadUrl(reportId: string): string {
    return `${getBaseUrl()}/api/admin/reports/${reportId}/download`
  }

  // ── Admin audit logs (who-did-what administrative trail) ───────────────────
  function buildAuditLogParams(params: {
    admin_id?: number
    action?: string
    target_type?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  }): URLSearchParams {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value))
      }
    })
    return searchParams
  }

  async function fetchAuditLogs(params: {
    admin_id?: number
    action?: string
    target_type?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  } = {}): Promise<AdminAuditLogsResponse> {
    monitorStore.setLoading('auditLogs', true)
    try {
      const searchParams = buildAuditLogParams(params)
      const response = await fetchWithAuth(`${getBaseUrl()}/api/admin/logs?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch audit logs')
      const data = await response.json()
      monitorStore.setAuditLogs(data.logs || [], data.total_count || 0)
      return data
    } finally {
      monitorStore.setLoading('auditLogs', false)
    }
  }

  function getAuditLogExportUrl(params: {
    admin_id?: number
    action?: string
    target_type?: string
    start_date?: string
    end_date?: string
  } = {}): string {
    const searchParams = buildAuditLogParams(params)
    const qs = searchParams.toString()
    return `${getBaseUrl()}/api/admin/logs/export${qs ? `?${qs}` : ''}`
  }

  return {
    fetchWithAuth,
    getBaseUrl,
    fetchDashboardStats,
    fetchRecentActivity,
    fetchLoginTrends,
    fetchAppUsage,
    fetchHealth,
    fetchSecurityEvents,
    fetchThreatMetrics,
    fetchSessions,
    revokeUserTokens,
    fetchTokenStats,
    fetchGeoAnalytics,
    fetchAuditIntegrity,
    fetchAlertRules,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule,
    fetchAlertHistory,
    acknowledgeAlert,
    fetchBlockedIPs,
    blockIP,
    unblockIP,
    fetchIPReputation,
    generateReport,
    fetchReportStatus,
    getReportDownloadUrl,
    fetchAuditLogs,
    getAuditLogExportUrl
  }
}
