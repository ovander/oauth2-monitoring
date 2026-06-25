// Security Event Types
//
// This union is kept in lock-step with the authoritative server enum in
// go-oauth2 `internal/model/security_audit_log.go` (SecurityEventType). Any
// event Socrate can emit must appear here so the monitoring SPA can label,
// filter, and categorise it — best-in-class monitoring means zero blind spots.
export type SecurityEventType =
  // Authentication & account lifecycle
  | 'login_success' | 'login_failed' | 'logout'
  | 'account_locked' | 'account_unlocked'
  | 'password_changed' | 'password_reset_requested' | 'password_reset_used'
  | 'email_verified' | 'email_change_requested' | 'email_changed'
  | 'user_registered' | 'user_invited' | 'invite_accepted'
  | 'email_send_failed'
  // Token lifecycle & abuse (OAuth 2.1 / RFC 9700)
  | 'token_issued' | 'token_refreshed' | 'token_revoked' | 'all_tokens_revoked'
  | 'invalid_token_used' | 'expired_token_used' | 'revoked_token_used'
  | 'refresh_token_reuse' | 'client_auth_failed'
  // OAuth 2.1 authorization-code + PKCE flow
  | 'auth_code_issued' | 'auth_code_exchanged' | 'auth_code_failed'
  | 'pkce_validation_failed'
  // Delegation (RFC 8693 token exchange)
  | 'token_exchange'
  // MFA / step-up (RFC-011)
  | 'mfa_policy_violation' | 'mfa_recovery_code_used'
  // Threat detection & integrity
  | 'suspicious_activity' | 'rate_limit_exceeded' | 'brute_force_detected'
  | 'audit_integrity_violation'

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
  /** RFC-008 correlation id linking this event to the originating request. */
  correlation_id?: string
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
  /** Optional hourly breakdown — only present if the server supplies it. */
  by_hour?: {
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

// Audit Integrity (RFC-007 tamper-evidence health of the security audit log)
export interface AuditIntegrityViolation {
  event_id: number
  kind: 'hmac' | 'chain' | 'unknown'
  details?: Record<string, any>
  detected_at: string
}

export interface AuditIntegrity {
  period: string
  configured: boolean
  status: 'verified' | 'violations_detected' | 'not_configured'
  total_events: number
  stamped_events: number
  chained_events: number
  coverage_percent: number
  violations: number
  last_violation_at?: string
  recent_violations: AuditIntegrityViolation[]
}

// Admin Audit Logs (administrative action trail — distinct from security events)
export interface AdminAuditLog {
  id: number
  admin_id: number
  admin_email: string
  action: string
  target_type: 'user' | 'application' | 'settings' | string
  target_id?: number
  target_name?: string
  changes?: Record<string, any>
  ip_address?: string
  created_at: string
}

export interface AdminAuditLogsResponse {
  logs: AdminAuditLog[]
  total_count: number
  page: number
  page_size: number
}

// Reports
export interface ReportRequest {
  type: 'security_summary'
  period: {
    from: string
    to: string
  }
  // Socrate's report endpoint supports JSON and CSV only.
  format: 'csv' | 'json'
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
// NOTE: there is intentionally no clientSecret. The monitoring console is a
// PUBLIC OAuth 2.1 client and authenticates with PKCE only — a confidential
// client secret must never be present in the browser.
export interface MonitorConfig {
  adminUrl: string
  oauthUrl: string
  clientId: string
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

// Event type labels — must cover every member of SecurityEventType.
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
  email_change_requested: 'Email Change Requested',
  email_changed: 'Email Changed',
  user_registered: 'User Registered',
  user_invited: 'User Invited',
  invite_accepted: 'Invite Accepted',
  email_send_failed: 'Email Send Failed',
  token_issued: 'Token Issued',
  token_refreshed: 'Token Refreshed',
  token_revoked: 'Token Revoked',
  all_tokens_revoked: 'All Tokens Revoked',
  invalid_token_used: 'Invalid Token Used',
  expired_token_used: 'Expired Token Used',
  revoked_token_used: 'Revoked Token Used',
  refresh_token_reuse: 'Refresh Token Reuse',
  client_auth_failed: 'Client Auth Failed',
  auth_code_issued: 'Auth Code Issued',
  auth_code_exchanged: 'Auth Code Exchanged',
  auth_code_failed: 'Auth Code Failed',
  pkce_validation_failed: 'PKCE Validation Failed',
  token_exchange: 'Token Exchange',
  mfa_policy_violation: 'MFA Policy Violation',
  mfa_recovery_code_used: 'MFA Recovery Code Used',
  suspicious_activity: 'Suspicious Activity',
  rate_limit_exceeded: 'Rate Limit Exceeded',
  brute_force_detected: 'Brute Force Detected',
  audit_integrity_violation: 'Audit Integrity Violation'
}

// ── Event categories ─────────────────────────────────────────────────────────
// Group every event type into a coherent security domain so the SPA can render
// taxonomy badges, filter by domain, and reason about coverage.
export type EventCategory =
  | 'authentication'
  | 'account'
  | 'token'
  | 'oauth'
  | 'delegation'
  | 'mfa'
  | 'threat'
  | 'integrity'

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  authentication: 'Authentication',
  account: 'Account & Provisioning',
  token: 'Token Lifecycle',
  oauth: 'OAuth 2.1 Flow',
  delegation: 'Delegation',
  mfa: 'Multi-Factor Auth',
  threat: 'Threat Detection',
  integrity: 'Audit Integrity'
}

export const EVENT_TYPE_CATEGORIES: Record<SecurityEventType, EventCategory> = {
  login_success: 'authentication',
  login_failed: 'authentication',
  logout: 'authentication',
  account_locked: 'authentication',
  account_unlocked: 'authentication',
  password_changed: 'account',
  password_reset_requested: 'account',
  password_reset_used: 'account',
  email_verified: 'account',
  email_change_requested: 'account',
  email_changed: 'account',
  user_registered: 'account',
  user_invited: 'account',
  invite_accepted: 'account',
  email_send_failed: 'account',
  token_issued: 'token',
  token_refreshed: 'token',
  token_revoked: 'token',
  all_tokens_revoked: 'token',
  invalid_token_used: 'token',
  expired_token_used: 'token',
  revoked_token_used: 'token',
  refresh_token_reuse: 'token',
  client_auth_failed: 'oauth',
  auth_code_issued: 'oauth',
  auth_code_exchanged: 'oauth',
  auth_code_failed: 'oauth',
  pkce_validation_failed: 'oauth',
  token_exchange: 'delegation',
  mfa_policy_violation: 'mfa',
  mfa_recovery_code_used: 'mfa',
  suspicious_activity: 'threat',
  rate_limit_exceeded: 'threat',
  brute_force_detected: 'threat',
  audit_integrity_violation: 'integrity'
}

// ── OAuth 2.1 protocol & token-integrity signals ─────────────────────────────
// The high-value detections that distinguish best-in-class OAuth 2.1 monitoring
// from generic auth logging. Each maps to a concrete protocol abuse / theft
// signal. Surfaced as a dedicated panel in the Threat Intelligence view.
export interface OAuth21Signal {
  event_type: SecurityEventType
  label: string
  /** Why it matters — shown as the detection rationale. */
  rationale: string
  /** Specification reference. */
  spec: string
}

export const OAUTH21_SIGNALS: OAuth21Signal[] = [
  {
    event_type: 'refresh_token_reuse',
    label: 'Refresh Token Replay',
    rationale: 'A rotated single-use refresh token was presented again — strong token-theft signal; family revoked in enforce mode.',
    spec: 'RFC 9700 §4.14.2'
  },
  {
    event_type: 'revoked_token_used',
    label: 'Revoked Token Use',
    rationale: 'A token that was explicitly revoked is still being presented — stolen or stale credential.',
    spec: 'RFC 7009'
  },
  {
    event_type: 'client_auth_failed',
    label: 'Client Authentication Failure',
    rationale: 'A confidential client failed authentication at the token endpoint — credential stuffing / client-secret brute force.',
    spec: 'RFC 6749 §3.2.1'
  },
  {
    event_type: 'pkce_validation_failed',
    label: 'PKCE Validation Failure',
    rationale: 'A code_verifier failed to match its challenge — auth-code interception / injection attempt.',
    spec: 'OAuth 2.1 / RFC 7636'
  },
  {
    event_type: 'token_exchange',
    label: 'Token Exchange (Delegation)',
    rationale: 'A delegation / impersonation token-exchange was processed — monitor for privilege escalation.',
    spec: 'RFC 8693'
  },
  {
    event_type: 'mfa_policy_violation',
    label: 'MFA Policy Violation',
    rationale: 'A subject under the MFA policy authenticated (or was denied) without enrolled MFA.',
    spec: 'RFC-011'
  },
  {
    event_type: 'mfa_recovery_code_used',
    label: 'MFA Recovery Code Used',
    rationale: 'A one-time recovery code was redeemed in place of TOTP — verify it was the legitimate user.',
    spec: 'RFC-011'
  },
  {
    event_type: 'audit_integrity_violation',
    label: 'Audit Integrity Violation',
    rationale: 'A stored audit row failed HMAC / hash-chain verification — tampering or corruption of the security log.',
    spec: 'RFC-007'
  },
  {
    event_type: 'expired_token_used',
    label: 'Expired Token Use',
    rationale: 'Repeated use of expired tokens can indicate replay attempts or a misconfigured / malicious client.',
    spec: 'RFC 6749'
  },
  {
    event_type: 'invalid_token_used',
    label: 'Invalid Token Use',
    rationale: 'Malformed or forged tokens presented to protected resources — probing / forgery attempt.',
    spec: 'RFC 6749'
  }
]

/** Set of event types considered OAuth 2.1 / token-integrity signals. */
export const OAUTH21_SIGNAL_EVENTS: SecurityEventType[] = OAUTH21_SIGNALS.map(s => s.event_type)

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
