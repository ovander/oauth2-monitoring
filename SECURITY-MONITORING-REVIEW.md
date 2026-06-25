# Security Architecture Review — OAuth2 Security Monitor SPA

**Reviewer:** Security Architect (Socrate platform)
**Date:** 2026-06-25
**Subject:** `oauth2-monitoring` SPA alignment with Socrate (go-oauth2) OAuth 2.1
**Objective:** Reach best-in-class security monitoring — align the SPA with the
current Socrate OAuth 2.1 server and ensure **all** existing Socrate security
functionality is actually monitored, with zero blind spots.

---

## 1. Executive Summary

The monitoring SPA was structurally sound (PKCE login, in-memory tokens, RBAC,
CSP) but had **drifted out of alignment** with the Socrate server it monitors.
Three classes of problem were found and remediated:

1. **Broken integrations** — calls that silently failed against the live API.
2. **Monitoring blind spots** — OAuth 2.1 / OIDC security events Socrate emits
   that the SPA could not label, filter, or surface.
3. **Unmonitored subsystems** — server capabilities (admin audit trail,
   request correlation) with no representation in the UI at all.

All findings are resolved on branch `claude/wizardly-keller-yja9uc` in both
repositories. The SPA type-checks, builds, and passes its test suite (88 tests);
the server builds and its handler/dto tests pass.

---

## 2. Findings & Remediation

### MON-01 · HIGH — Threat-intelligence time filter was inert
The Threat Intelligence view sent `?time_range=…`, but Socrate's
`GetThreatMetrics` reads the **`period`** query parameter. Every selection
(15m / 1h / 7d / 30d) silently fell back to the 24h default — operators believed
they were narrowing the window when they were not.
**Fix:** `useApi.fetchThreatMetrics` now sends `?period=`. Regression test added.

### MON-02 · HIGH — "Revoke session" was a no-op against a non-existent route
`SessionsView` called `DELETE /api/admin/sessions/{id}`, which **does not exist**
on the server. Sessions in Socrate are *derived* from the security audit log —
there is no session table and no per-session revocation. An analyst clicking
"Revoke" got a success-shaped failure and the user stayed authenticated.
**Fix:** Re-pointed to the real OAuth 2.1 control —
`POST /api/admin/users/{id}/revoke-tokens` — which revokes every token for the
user, terminating all their sessions across apps. Bulk action de-duplicates by
user. UI relabelled to "Revoke User Tokens" with an explicit confirmation.

### MON-03 · HIGH — Stale event taxonomy (OAuth 2.1 monitoring blind spots)
The SPA's `SecurityEventType` union was missing **11** event types Socrate now
emits, and carried a phantom (`auto_ip_block`) the server never produces.
Unknown events still rendered, but without labels, filters, or categorisation —
the highest-value OAuth 2.1 detections were effectively invisible. Newly covered:

| Event | Signal | Spec |
|-------|--------|------|
| `refresh_token_reuse` | Rotated refresh-token replay → token theft | RFC 9700 §4.14.2 |
| `client_auth_failed` | Confidential-client secret brute force | RFC 6749 §3.2.1 |
| `token_exchange` | Delegation / impersonation (privilege escalation) | RFC 8693 |
| `mfa_policy_violation` | MFA-required subject without enrolled MFA | RFC-011 |
| `mfa_recovery_code_used` | Recovery code redeemed in place of TOTP | RFC-011 |
| `audit_integrity_violation` | Audit row failed HMAC / hash-chain | RFC-007 |
| `all_tokens_revoked` | Mass revocation event | — |
| `user_invited`, `invite_accepted`, `email_change_requested`, `email_send_failed` | Account-provisioning lifecycle | — |

**Fix:** `SecurityEventType`, `EVENT_TYPE_LABELS` brought into lock-step with the
authoritative server enum (`internal/model/security_audit_log.go`). Added an
**event-category taxonomy** (`EVENT_TYPE_CATEGORIES`) grouping every event into a
security domain (Authentication / Account / Token / OAuth 2.1 Flow / Delegation /
MFA / Threat / Integrity).

### MON-04 · MEDIUM — Admin audit trail completely unmonitored
Socrate exposes `GET /api/admin/logs` (+ `/export` CSV) — a who-did-what trail of
administrative actions (unlock, revoke, role change, app create/delete, secret
rotation). The SPA had **no view** for it; privileged-operator accountability was
not observable from the monitoring tool.
**Fix:** New **Admin Audit Trail** view (`/audit-logs`, admin-only) with action /
target-type / period filters, paginated table, per-entry change-payload inspector,
and authenticated CSV export.

### MON-05 · MEDIUM — Request correlation dropped at the DTO boundary
`SecurityAuditLog.CorrelationID` (RFC-008 end-to-end tracing) was stored but
**never serialised** in `SecurityEventResponse`, so the SPA could not pivot from a
security event to the originating request.
**Fix (server, go-oauth2):** Added `correlation_id` to `SecurityEventResponse` and
`FromSecurityAuditLog`. **Fix (SPA):** `SecurityEvent.correlation_id` plumbed
through the SSE parser and shown in the event detail dialog.

### MON-06 · LOW — Report format offered an unsupported option
`ReportRequest.format` typed `'pdf' | 'csv' | 'json'`, but Socrate's report
endpoint rejects anything but `json`/`csv` (400). Narrowed the type to match.

### MON-07 · LOW — `TokenStats.by_hour` typed as required
The server may return `by_hour: null`. Marked optional to match reality (the
Token Analytics view already guarded it).

---

## 3. OAuth 2.1 Alignment — "Protocol & Token-Integrity" panel

Best-in-class OAuth 2.1 monitoring is defined by surfacing the protocol-abuse and
token-theft detections that generic auth logging misses. The Threat Intelligence
view now carries a dedicated **OAuth 2.1 Protocol & Token-Integrity** panel
(`OAUTH21_SIGNALS`) that makes coverage explicit — every signal is always listed
(so zero-activity coverage is visible), with active counts for the selected
period, the detection rationale, and a spec reference:

- Refresh-token replay (RFC 9700) · Revoked-token use (RFC 7009)
- Client-auth failure (RFC 6749) · PKCE validation failure (OAuth 2.1 / RFC 7636)
- Token exchange / delegation (RFC 8693) · MFA policy & recovery (RFC-011)
- Audit-integrity violation (RFC-007) · Expired / invalid token use

---

## 4. Residual Recommendations (not in this change)

These require server-side work or product decisions beyond a UI alignment pass:

1. **Real-time SSE push.** `StreamEvents` polls the DB every 2s and sets
   `Access-Control-Allow-Origin: *` on the stream. Consider event-bus push and
   tightening CORS on the stream to the configured origin.
2. **Persistent reports.** Report generation is in-memory (`map`), so reports are
   lost on restart and not multi-instance safe. Move to durable storage.
3. **DPoP / sender-constrained token observability.** Socrate supports DPoP
   (RFC 9449); a `dpop_jkt` confirmation rate / unbound-token panel would round
   out OAuth 2.1 token-binding monitoring once the server emits a dedicated event.
4. **Audit-integrity status surface.** Expose the hash-chain verification state
   (`row_hash`/`prev_hash`) as a first-class health indicator, not only via the
   `audit_integrity_violation` event.

---

## 5. Verification

| Check | Result |
|-------|--------|
| `vue-tsc -b` (SPA type-check) | ✅ 0 errors |
| `vitest run` (SPA) | ✅ 88 passed |
| `vite build` (SPA) | ✅ built |
| `go build ./...` (server) | ✅ |
| `go test ./internal/dto/... ./internal/handler/...` | ✅ |
