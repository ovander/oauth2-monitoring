// Security Event Types
export type SecurityEventType =
  | 'login_success' | 'login_failed' | 'logout'
  | 'account_locked' | 'account_unlocked'
  | 'password_changed' | 'password_reset_requested' | 'password_reset_used'
  | 'email_verified' | 'email_changed'
  | 'token_issued' | 'token_refreshed' | 'token_revoked'
  | 'invalid_token_used' | 'expired_token_used' | 'revoked_token_used'
  | 'auth_code_issued' | 'auth_code_exchanged' | 'auth_code_failed'
  | 'pkce_validation_failed'
  | 'suspicious_activity' | 'rate_limit_exceeded' | 'brute_force_detected'
  | 'auto_ip_block' | 'user_registered'

export type Severity = 'info' | 'warning' | 'error' | 'critical'

export interface SecurityEvent {
  id: number
  user_id?: number
  user_email?: string
  app_id?: number
  app_name?: string
  event_type: SecurityEventType
  severity: Severity
  ip_address: string
  user_agent?: string
  details?: Record<string, any>
  success: boolean
  created_at: string
}

// Dashboard Types
export interface DashboardStats {
  total_users: number
  active_users: number
  total_apps: number
  active_apps: number
  today_logins: number
  today_signups: number
  failed_logins_24h: number
  locked_accounts: number
}

export interface Activity {
  id: number
  type: string
  description: string
  user_id?: number
  user_email?: string
  app_id?: number
  app_name?: string
  ip_address: string
  success: boolean
  metadata?: Record<string, any>
  created_at: string
}

export interface ActivityResponse {
  activities: Activity[]
  total: number
}

export interface LoginTrend {
  date: string
  success_count: number
  failure_count: number
  unique_users: number
}

export interface LoginTrendsResponse {
  trends: LoginTrend[]
  period: string
}

export interface AppUsage {
  app_id: number
  app_name: string
  client_id: string
  total_users: number
  active_users: number
  total_logins: number
  last_activity: string
}

export interface AppUsageResponse {
  apps: AppUsage[]
  total: number
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  database: {
    status: string
    latency: string
  }
  uptime: string
  version: string
  details?: {
    go_version?: string
    started_at?: string
  }
}

// Security Events Response
export interface SecurityEventsResponse {
  events: SecurityEvent[]
  total: number
  page: number
  page_size: number
}

// Threat Intelligence
export interface ThreatSummary {
  total_events: number
  critical_events: number
  error_events: number
  warning_events: number
  unique_attackers: number
}

export interface TopThreat {
  type: string
  count: number
  unique_ips: number
  affected_users?: number
  affected_apps?: number
}

export interface SuspiciousIP {
  ip_address: string
  event_count: number
  event_types: string[]
  first_seen: string
  last_seen: string
}

export interface LockedAccount {
  user_id: number
  email: string
  locked_at: string
  locked_until: string
  failed_attempts: number
}

export interface ThreatMetrics {
  time_range: string
  summary: ThreatSummary
  top_threats: TopThreat[]
  suspicious_ips: SuspiciousIP[]
  locked_accounts: LockedAccount[]
}

// Session Management
export interface Session {
  id: string
  user_id: number
  user_email: string
  app_id: number
  app_name: string
  ip_address: string
  user_agent?: string
  created_at: string
  last_activity: string
  expires_at: string
}

export interface SessionsResponse {
  sessions: Session[]
  total: number
  page: number
  page_size: number
}

// Token Analytics
export interface TokenStats {
  period: string
  issued: {
    access_tokens: number
    refresh_tokens: number
    id_tokens: number
  }
  refreshed: number
  revoked: number
  expired_usage_attempts: number
  invalid_usage_attempts: number
  by_app: {
    app_id: number
    app_name: string
    issued: number
    refreshed: number
    revoked: number
  }[]
  by_hour: {
    hour: string
    issued: number
    refreshed: number
    revoked: number
  }[]
}

// Geographic Analytics
export interface GeoCountry {
  country_code: string
  country_name: string
  login_count: number
  unique_users: number
  failed_count: number
}

export interface GeoCity {
  city: string
  country_code: string
  latitude: number
  longitude: number
  login_count: number
  failed_count: number
}

export interface GeoAnomaly {
  user_id: number
  user_email: string
  description: string
  usual_country: string
  login_country: string
  created_at: string
}

export interface GeoAnalytics {
  period: string
  geo_configured: boolean
  by_country: GeoCountry[]
  by_city: GeoCity[]
  anomalies: GeoAnomaly[]
}

// Alert Rules
export interface AlertCondition {
  threshold: number
  window_minutes: number
  group_by?: 'ip_address' | 'user_id' | 'app_id'
  count_distinct?: string
}

export interface AlertRule {
  id: number
  name: string
  description: string
  event_type: string
  condition: AlertCondition
  severity: Severity
  enabled: boolean
  actions: ('email' | 'webhook' | 'slack')[]
  recipients?: string[]
  webhook_url?: string
  created_at: string
  updated_at?: string
}

export interface AlertRulesResponse {
  rules: AlertRule[]
}

// Triggered Alerts
export interface TriggeredAlert {
  id: number
  rule_id: number
  rule_name: string
  severity: Severity
  message: string
  details?: {
    ip_address?: string
    affected_users?: number[]
    event_count?: number
  }
  acknowledged: boolean
  acknowledged_by?: number
  acknowledged_at?: string
  acknowledge_note?: string
  triggered_at: string
}

export interface AlertHistoryResponse {
  alerts: TriggeredAlert[]
  total: number
  unacknowledged: number
}

// IP Blocking
export interface BlockedIP {
  id: number
  ip_address: string
  reason: string
  blocked_by?: number
  blocked_by_email?: string
  blocked_at: string
  expires_at?: string
  permanent: boolean
}

export interface BlockedIPsResponse {
  blocked_ips: BlockedIP[]
  total: number
}

export interface IPReputation {
  ip_address: string
  is_blocked: boolean
  risk_score: number
  events_24h: number
  events_7d: number
  failed_logins_24h: number
  unique_users_targeted: number
  first_seen: string
  last_seen: string
  recent_events: {
    event_type: string
    user_email?: string
    created_at: string
  }[]
}

// Reports
export interface ReportRequest {
  type: 'security_summary'
  period: {
    from: string
    to: string
  }
  format: 'pdf' | 'csv' | 'json'
  sections?: string[]
}

export interface ReportStatus {
  report_id: string
  status: 'generating' | 'completed' | 'failed'
  download_url?: string
  expires_at?: string
  created_at: string
  error?: string
}

// SSE Event
export interface SSEEvent {
  type: 'security_event' | 'heartbeat' | 'alert'
  data: SecurityEvent | { timestamp: string } | TriggeredAlert
}

// Config
export interface MonitorConfig {
  adminUrl: string
  oauthUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  setupCompleted: boolean
}

// Auth State
export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
  tokenType: string
  /** Top-level roles array returned by the server alongside the tokens (non-standard but common). */
  rolesFromResponse?: string[]
}

export interface UserInfo {
  sub: string
  name?: string
  email?: string
  roles?: string[]
}

// Event type labels
export const EVENT_TYPE_LABELS: Record<string, string> = {
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  logout: 'Logout',
  account_locked: 'Account Locked',
  account_unlocked: 'Account Unlocked',
  password_changed: 'Password Changed',
  password_reset_requested: 'Password Reset Requested',
  password_reset_used: 'Password Reset Used',
  email_verified: 'Email Verified',
  email_changed: 'Email Changed',
  token_issued: 'Token Issued',
  token_refreshed: 'Token Refreshed',
  token_revoked: 'Token Revoked',
  invalid_token_used: 'Invalid Token Used',
  expired_token_used: 'Expired Token Used',
  revoked_token_used: 'Revoked Token Used',
  auth_code_issued: 'Auth Code Issued',
  auth_code_exchanged: 'Auth Code Exchanged',
  auth_code_failed: 'Auth Code Failed',
  pkce_validation_failed: 'PKCE Validation Failed',
  suspicious_activity: 'Suspicious Activity',
  rate_limit_exceeded: 'Rate Limit Exceeded',
  brute_force_detected: 'Brute Force Detected',
  auto_ip_block: 'Auto IP Block',
  user_registered: 'User Registered'
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626'
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical'
}
