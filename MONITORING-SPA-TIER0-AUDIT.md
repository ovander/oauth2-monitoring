# Tier-0 Security & Functional Audit — Socrate Monitoring SPA

**Auditor role:** Principal Identity Security Architect · OAuth 2.1 / OIDC Expert · Zero-Trust Architect · Detection Engineering · Enterprise SOC Architect
**Date:** 2026-06-25
**Targets:** `oauth2-monitoring` (SPA) consuming `go-oauth2` / "Socrate" (admin API)
**Classification of SPA:** **Tier-0** (privileged operational console for the identity platform)
**Verdict (one line):** **NOT production-ready for the stated threat model.** The console is sound as a *dashboard* but is architected as a **trusted browser client with write access to the Tier-0 control plane using replayable bearer tokens** — a single XSS or one poisoned dependency is sufficient to pivot into Socrate.

> Evidence is cited as `repo:path:line`. Findings already remediated during this engagement (event-taxonomy alignment, admin audit trail, audit-integrity surface, SSE CORS, report persistence, correlation_id) are noted where relevant; this audit is otherwise deliberately adversarial.

---

## 1. Executive Summary

The Monitoring SPA is a well-built Vue 3 dashboard. Token storage is in-memory (not `localStorage`), the login flow is Authorization-Code + PKCE (`S256`) with `state`/CSRF validation, and a baseline CSP and security-header set are present. Recent work closed the worst *functional* monitoring gaps (full OAuth 2.1 event taxonomy, admin audit trail, RFC-007 integrity surface, request-correlation IDs).

However, judged as a **Tier-0 component for a platform that will protect millions of identities, government and critical-infrastructure tenants**, it has **architectural defects that no amount of frontend hardening can fix**:

1. **No Backend-for-Frontend.** The browser calls the Socrate **admin API directly** with a bearer access token (`oauth2-monitoring:src/composables/useApi.ts:35-42`). The control plane is one `fetch` away from any JavaScript running in the tab.
2. **Replayable bearer tokens in the JS heap.** Access **and** refresh tokens live in a Pinia ref (`oauth2-monitoring:src/stores/authStore.ts:33`). They are **not DPoP / sender-constrained** despite Socrate supporting DPoP (RFC 9449). A stolen token is replayable from anywhere.
3. **A confidential `client_secret` can live in the browser.** Settings accepts a client secret kept in the in-memory config and appended to token requests (`authStore.ts:185-187, 278-280`; `SettingsView.vue:161`). A confidential-client secret in a SPA is a category error.
4. **The "monitoring" console wields destructive Tier-0 power.** It can revoke user tokens, block/unblock IPs, and create/delete alert rules (`useApi.ts` `revokeUserTokens`, `blockIP`, `unblockIP`, `deleteAlertRule`). Monitoring and administration are **not** separated; there is **no read-only monitoring scope or dedicated client**.
5. **Authorization is enforced only by the access token's roles.** Client-side route guards are cosmetic (`router/index.ts`); the real boundary is the JWT the browser carries — and that JWT is a general-purpose admin token, not a least-privilege monitoring credential.

Net: **a browser compromise is a Tier-0 compromise**, bounded only by the roles of the monitoring principal — which today are general admin roles.

---

## 2–7. Scorecard

Scores are 0–100. For maturity/security categories **higher = better**. For **Tier-0 Exposure**, **higher = worse** (more exposed) — stated explicitly to avoid ambiguity.

| # | Dimension | Score | Direction | One-line basis |
|---|-----------|:----:|:---------:|----------------|
| 2 | **Monitoring Coverage** | **58** | ↑ better | Event taxonomy now complete for emitted events + audit trail/integrity; blind to DPoP, passkeys/WebAuthn, UserInfo/Discovery/JWKS usage, tenant lifecycle, and all client-side CSP/CORS/CSRF telemetry. |
| 3 | **Detection Maturity** | **42** | ↑ better | Static threshold alert-rule engine + OAuth 2.1 signal panel; no behavioral baseline, no automated impossible-travel, no DPoP/passkey/token-substitution detection, detection mostly human-in-the-loop. |
| 4 | **Incident Response** | **33** | ↑ better | Can block IP, revoke user tokens, ack alerts; cannot disable user, quarantine/disable client, lock tenant, or rotate/invalidate signing keys from the console. |
| 5 | **Investigation / Forensics** | **55** | ↑ better | `correlation_id`, admin audit trail, integrity health, event timeline, geo; no per-entity drill-down timeline, no token-lifecycle reconstruction, no immutable export pipeline. |
| 6 | **SPA Security** | **50** | ↑ better | In-memory tokens, PKCE+state, no source maps, `--ignore-scripts`; but weak CSP (no Trusted Types, broad `ws:`, `unsafe-inline` styles), client-side RBAC, refresh-token/secret in heap, committed `dist.bak/`, hardcoded prod host. |
| 7 | **Tier-0 Exposure** | **78** | ↓ **worse** | Browser holds replayable bearer tokens with **write** access to the admin control plane, no BFF, no DPoP, no step-up. High blast radius. |

**Overall posture: HIGH RISK for Tier-0 production use.**

---

## 8. Can the SPA compromise Socrate? — **Yes.**

### Attack chain A — XSS / malicious dependency → Tier-0 takeover
1. Attacker achieves script execution in the SPA origin: a DOM/stored/reflected XSS, a compromised npm dependency (the app ships a large PrimeVue/Chart.js/date-fns tree), or a malicious browser extension.
2. CSP does **not** stop exfiltration: `script-src 'self'` blocks injected `<script src>` but the runtime is already executing in-origin; `connect-src 'self' ws: wss:` (`nginx.conf:27`) **permits WebSocket connections to any host**, a ready-made exfil channel.
3. The payload reads the in-memory access **and** refresh tokens directly from the Pinia store (`authStore.ts:33, 314-316`) and the `client_secret` from config if set (`authStore.ts:26`).
4. Because tokens are **plain bearer (no DPoP binding)**, the attacker replays them from their own infrastructure against the admin API — no proof-of-possession key is required.
5. With the refresh token + (optional) client_secret, the attacker **mints fresh access tokens indefinitely** (`authStore.ts:267-302`), surviving the victim closing the tab.
6. Using the monitoring principal's roles, the attacker calls the admin API directly: revoke arbitrary users' tokens (mass denial of service / forced re-auth phishing), block/unblock IPs (disable defenses, or lock out responders), and **delete alert rules to blind the SOC** (`useApi.deleteAlertRule`). If the monitoring principal holds a general `admin` role (the default `VITE_ADMIN_ROLES=admin`), the **entire admin surface** is reachable: create/delete OAuth clients, rotate secrets, manage superadmins, change settings.

### What the attacker can do, itemized
| Capability | Reachable? | Note |
|---|:--:|---|
| Steal access/refresh tokens | **Yes** | In JS heap, no DPoP |
| Reuse/replay tokens off-box | **Yes** | Bearer, not sender-constrained |
| Call privileged admin APIs | **Yes** | Direct browser→admin API, bound by principal roles |
| Mint new tokens after tab close | **Yes** | Refresh token (+secret) in heap |
| Disable audit logs | Partial | Cannot delete audit rows via SPA APIs, but **can delete alert rules** to blind detection |
| Delete evidence | Partial | Audit log is hash-chained (RFC-007) → tamper-**evident**, not tamper-proof |
| Create OAuth clients / backdoors | **If** principal has admin role | SPA doesn't expose it, but the token does |
| Rotate/invalidate signing keys | No (from SPA) | Not exposed; server-side only |
| Move laterally / cross-tenant | **If** principal role spans tenants | No tenant scoping on the monitoring credential |

**Mitigating truths:** tokens are not in `localStorage` (no persistence across reload for the attacker beyond the live refresh token), PKCE+`state` prevent code interception/CSRF on login, and the audit log is hash-chained so tampering is detectable. These reduce but **do not remove** the Tier-0 pivot.

---

## 9. Missing Monitoring Features (ranked)

**CRITICAL**
- **DPoP / sender-constrained-token failures** — Socrate supports DPoP; there is **no event type** for DPoP validation failure and nothing in the SPA. Token-theft via replay is both unpreventable *and* invisible.
- **Passkey / WebAuthn events** — platform advertises passkeys; no authentication/registration/failure events are modeled or shown.
- **Client-side security telemetry** — no CSP `report-to`/`report-uri`, no CORS/CSRF/XSS violation collection. The Tier-0 console cannot see attacks against itself.

**HIGH**
- **OAuth client lifecycle as security signal** — create/delete, secret rotation, redirect-URI/grant/scope changes are in the admin audit trail (now surfaced) but are **not** security events and **not alertable**. Redirect-URI tampering is a classic account-takeover primitive.
- **Tenant lifecycle** — creation/deletion/lock not surfaced (multi-tenant platform).
- **UserInfo / Discovery / JWKS usage analytics** — OIDC endpoint abuse (enumeration, scraping) is invisible.
- **MFA bypass attempts** vs. policy violations — only `mfa_policy_violation` / `mfa_recovery_code_used` exist; no explicit "MFA challenge failed/bypassed" counter.

**MEDIUM**
- **Impossible travel** (time+distance) — Geo view flags multi-IP, not true impossible travel.
- **Concurrent-session detection** — sessions are *derived* from audit logs, not authoritative; no real concurrent-session count or cap alerting.
- **Long-lived / anomalous refresh-token age** analytics.

**LOW**
- ID-token issuance broken out from access tokens; per-scope/audience issuance breakdowns.

---

## 10. Missing Detection Capabilities
- **Behavioral baselining / anomaly scoring** — detection is static thresholds (`AlertRule.condition`) only.
- **Automated impossible-travel and geo-velocity** rules.
- **Token substitution / audience confusion / scope-escalation** detection.
- **Credential stuffing vs. password spraying differentiation** (spraying = low-and-slow across many accounts) — current threshold rules key on per-IP/per-user counts and will miss distributed spraying.
- **Compromised-client detection** (sudden grant/scope/redirect changes + token spike correlation).
- **DPoP/passkey-based assurance signals** feeding risk.

---

## 11. Missing Defensive / Response Capabilities
- **No step-up / re-authentication** in the console for destructive actions. Socrate exposes `POST /api/admin/elevate` (fresh-auth) — the SPA never calls it.
- **No "disable user / quarantine client / lock tenant / rotate-or-revoke signing key" emergency actions** from the SOC console (some intentionally; see Part 12 on separation).
- **No session-kill switch** beyond per-user token revocation; no global "revoke all tokens for tenant/client."
- **No break-glass workflow** with mandatory MFA + reason capture + heightened audit.
- **No automatic responder actions** (alert → auto-block, alert → auto-revoke) — alerting is notify-only.

---

## 12. Recommended Architectural Improvements (the important part)

**A. Introduce a Backend-for-Frontend (BFF) — mandatory for Tier-0.**
- Browser holds an **HttpOnly, Secure, SameSite=Strict** session cookie only. **No OAuth tokens in JavaScript, ever.**
- The BFF holds the OAuth tokens server-side, performs the code exchange, and is the only thing that talks to the Socrate admin API. This removes the entire "tokens in the heap → replay" class of attack.

**B. Separate monitoring from administration.**
- A **dedicated, read-only monitoring OAuth client** with a **`monitoring:read` scope** that maps only to the read endpoints. Destructive endpoints (revoke, block, alert-rule mutation) move behind a **second, explicitly-elevated path** requiring step-up.
- The monitoring principal must **not** carry a general `admin` role. Today `VITE_ADMIN_ROLES=admin` conflates the two.

**C. Sender-constrain everything (DPoP, RFC 9449).**
- Even with a BFF, bind the BFF→Socrate tokens with DPoP or mTLS so a server-side leak is not freely replayable.

**D. Enforce least privilege server-side per route.**
- Gate every mutating monitoring action with `RequireFreshAuth` (the mechanism already exists for app delete / secret rotation) and a `monitoring:write` scope.

**E. Harden the CSP to Tier-0 grade.**
- Add `require-trusted-types-for 'script'` + a Trusted Types policy; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`; replace `connect-src 'self' ws: wss:` with an **explicit allowlist** (no open `ws:`/`wss:`); add a `report-to`/`report-uri` and ingest those reports back into Socrate monitoring.

**F. Repo / build hygiene.**
- Remove committed `dist.bak/` build artifacts; remove the hardcoded production host (`golfperformance.fr`) from `vite.config.ts` and `index.html`; add Subresource Integrity or fully self-host fonts (drop `fonts.googleapis.com`/`gstatic.com` from CSP); add `npm audit` / SBOM / Dependabot gating in CI; keep `--ignore-scripts` (already present).

**G. Make detections and responses first-class.**
- Add CSP/violation ingestion, impossible-travel, behavioral baselines, and alert→auto-response playbooks. Promote client-lifecycle changes to alertable security events.

---

## 13. Production Readiness Assessment

**Can it safely operate in production today (millions of identities, gov, critical infra)? — No.**

It can run as a **low-risk read-only dashboard** behind a BFF for a small, trusted operator set. It must **not** be deployed as-is as a Tier-0 console that holds tokens in the browser and writes to the admin control plane.

**Must fix before production (blockers):**
1. **BFF** — eliminate all OAuth tokens from the browser.
2. **Read-only monitoring scope + dedicated client**; strip the general `admin` role from the monitoring principal.
3. **No `client_secret` in the SPA** under any configuration.
4. **DPoP / sender-constraint** on the token that reaches Socrate.
5. **Step-up (fresh-auth)** + server-side scope enforcement for every mutating action.
6. CSP hardening (Trusted Types, explicit `connect-src`, reporting); remove `dist.bak/` and hardcoded hosts.

**Should be redesigned:**
- The **trust model**: from "trusted browser client of the admin API" to "untrusted browser + trusted BFF + least-privilege monitoring scope + sender-constrained tokens." This is the single change that converts the console from a Tier-0 liability into a Tier-0-appropriate component.

**Already improved during this engagement (keep):** complete OAuth 2.1 event taxonomy, admin audit trail view, RFC-007 audit-integrity surface, SSE CORS hardening, DB-persisted reports, request `correlation_id`.

---

*Be it noted: the audit log being hash-chained (RFC-007) means evidence tampering is detectable, but detection is not prevention. Treat the chain as a tripwire, not a control.*
