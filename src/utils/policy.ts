/**
 * Labels for the access-policy decision log (Socrate A4). Pure functions,
 * unit-tested directly.
 */
import type { PolicyDecisionRecord } from '@/types'

const REASONS: Record<string, string> = {
  allowed_by_rule:         'Allowed by rule',
  denied_by_rule:          'Denied by rule',
  deny_rule_indeterminate: 'Denied — a deny rule could not be evaluated (missing attribute)',
  no_applicable_rule:      'Denied — no rule applies (default deny)',
  policy_unavailable:      'No policy could be loaded',
  subject_locked:          'Denied — the account is locked',
}

/** A decision reason in words; obligation_unmet:<name> keeps its obligation. */
export function reasonLabel(reason: string): string {
  if (reason.startsWith('obligation_unmet:')) {
    return `Denied — obligation not met (${reason.slice('obligation_unmet:'.length)})`
  }
  return REASONS[reason] ?? reason
}

const DIVERGENCES: Record<string, string> = {
  pdp_deny_code_allow: 'Policy stricter than the built-in checks',
  pdp_allow_code_deny: 'Policy looser than the built-in checks',
}

export function divergenceLabel(kind?: string): string {
  if (!kind) return ''
  return DIVERGENCES[kind] ?? kind
}

const SOURCES: Record<string, string> = {
  admin_pep:  'Admin API',
  decide_api: 'Application',
}

export function sourceLabel(source: string): string {
  return SOURCES[source] ?? source
}

export type Outcome = { label: string; severity: 'danger' | 'warn' | 'success' | 'secondary' }

/**
 * What happened to the request: refused (enforce), would-deny (shadow), or an
 * allow that was logged because it disagreed with the built-in checks.
 */
export function outcome(d: Pick<PolicyDecisionRecord, 'allow' | 'enforced' | 'reason'>): Outcome {
  if (d.allow) return { label: 'Allowed', severity: 'success' }
  if (d.reason === 'policy_unavailable') return { label: 'No policy', severity: 'secondary' }
  if (d.enforced) return { label: 'Refused', severity: 'danger' }
  return { label: 'Would deny', severity: 'warn' }
}

/** Who asked about whom, in one line. */
export function principalLabel(d: Pick<PolicyDecisionRecord, 'principal_kind' | 'principal_id' | 'client_id' | 'source'>): string {
  const who = d.principal_kind === 'client'
    ? `client ${d.client_id ?? ''}`.trim()
    : d.principal_id ? `user #${d.principal_id}` : '—'
  if (d.source === 'decide_api' && d.client_id && d.principal_kind !== 'client') {
    return `${who} via ${d.client_id}`
  }
  return who
}

/** RFC 3339 start of a period ("24h", "7d", "30d"); undefined for "all". */
export function sinceFromPeriod(period: string, now: Date = new Date()): string | undefined {
  const hours: Record<string, number> = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }
  const h = hours[period]
  return h ? new Date(now.getTime() - h * 3600 * 1000).toISOString() : undefined
}
