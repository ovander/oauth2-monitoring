# Tier-0 Remediation Plan — Socrate Monitoring SPA

Sprint-based plan to close the findings in `MONITORING-SPA-TIER0-AUDIT.md`. Each work
item is tracked as a GitHub issue and shipped as its own branch + PR.

> Trust-model goal: move from *"trusted browser client of the admin API"* to
> *"untrusted browser + trusted BFF + least-privilege monitoring scope +
> sender-constrained tokens."*

## Sprint overview

| Sprint | Theme | Risk closed | Issues |
|--------|-------|-------------|--------|
| **1** | Frontend hardening & hygiene | XSS exfil surface, secret-in-browser, repo hygiene | monitoring #3, #4, #5 |
| **2** | Least privilege & step-up | Over-privileged console, no re-auth on destructive ops | monitoring #6, go-oauth2 #201 |
| **3** | Backend-for-Frontend (**blocker**) | Tokens in the browser → Tier-0 pivot | monitoring #7 |
| **4** | Sender-constrained tokens | Bearer-token replay; DPoP failures invisible | go-oauth2 #202 |
| **5** | Detection & coverage | Blind spots (passkeys, OIDC endpoints, client lifecycle) | go-oauth2 #203, monitoring CSP-ingestion |

Severity ordering for delivery: **S3 (BFF)** is the single highest-impact change, but
S1 is shipped first because it is low-risk, self-contained, and reduces the XSS blast
radius that makes S3 urgent. S2 and S4 harden the credential even after the BFF lands.

---

## Sprint 1 — Frontend Hardening & Hygiene  *(SPA-only, low risk)*
- **#3 Harden CSP to Tier-0 grade** — `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`, `form-action 'self'`; drop open `ws:`/`wss:`; add Trusted
  Types in report-only + CSP reporting hook.
- **#4 Remove committed `dist.bak/` + hardcoded prod host** — gitignore build output;
  parameterize the dev proxy target; drop `golfperformance.fr` from CSP.
- **#5 Remove `client_secret` from the SPA** — public PKCE client only; no confidential
  secret ever present in the browser.

## Sprint 2 — Least Privilege & Step-Up  *(two-repo)*
- **go-oauth2 #201** — `monitoring:read` / `monitoring:write` scopes, dedicated public
  PKCE monitoring client, per-route scope + `RequireFreshAuth` on every mutation.
- **monitoring #6** — call `/api/admin/elevate` (step-up) before revoke / block /
  alert-rule delete; intent + reason capture.

## Sprint 3 — Backend-for-Frontend  *(blocker)*
- **monitoring #7** — BFF holds all OAuth tokens server-side; browser gets an HttpOnly,
  Secure, SameSite=Strict session cookie only; BFF is the sole client of the Socrate
  admin API; CSRF protection on state-changing routes.

## Sprint 4 — Sender-Constrained Tokens
- **go-oauth2 #202** — DPoP (RFC 9449) on the monitoring/admin path; add
  `dpop_validation_failed` event; surface it in the SPA OAuth 2.1 signals panel.

## Sprint 5 — Detection & Coverage
- **go-oauth2 #203** — emit passkey/WebAuthn + OIDC-endpoint (UserInfo/Discovery/JWKS)
  events; promote OAuth-client lifecycle changes to alertable security events; tenant
  lifecycle events.
- **monitoring (follow-up)** — CSP/CORS violation ingestion endpoint + dashboard;
  impossible-travel + behavioral baselining; alert → auto-response playbooks.

---

## Definition of done (every issue)
- Acceptance criteria in the issue met.
- `vue-tsc` / `go build` clean; `vitest` / `go test` green; `gofmt`/`go vet` clean.
- Branch named `fix/sN-<slug>`; PR links and closes its issue.
- No secrets, tokens, or hardcoded hosts introduced.
