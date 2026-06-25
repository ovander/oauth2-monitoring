# ADR-0001 — Backend-for-Frontend for the Socrate Monitoring Console

**Status:** Proposed (review before implementation)
**Sprint:** 3 · **Issue:** #7 · **Severity:** Critical (the audit's core blocker)
**Supersedes the trust model in:** `MONITORING-SPA-TIER0-AUDIT.md` §8, §12-A

---

## 1. Context

The monitoring SPA is a **Tier-0** console. Today it is a *trusted browser client*:
it holds OAuth access **and** refresh tokens in the JS heap and calls the Socrate
admin API directly (`useApi.ts`, `authStore.ts`). Per the audit, that makes a
single XSS or one poisoned dependency sufficient to steal **replayable bearer
tokens** and pivot into the control plane. Sprints 1–2 (CSP hardening, secret
removal, step-up) reduced the blast radius but **cannot** remove this class:
as long as tokens live in JavaScript, script execution in the origin = token theft.

**Goal:** no OAuth tokens in the browser, ever. The browser holds only an opaque,
`HttpOnly` session cookie it cannot read; all token custody and admin-API calls
move server-side behind a Backend-for-Frontend (BFF).

---

## 2. Decision

Introduce a **BFF** that is the *only* client of the Socrate admin API for the
monitoring console. The browser authenticates to the BFF with a cookie; the BFF
performs the OAuth 2.1 Authorization-Code + PKCE exchange, stores tokens
server-side, and proxies the SPA's read/write calls — attaching the access token
(and, post-Sprint-4, a DPoP proof) on the server side.

### 2.1 Recommended stack — **Go**

| Option | Verdict | Why |
|--------|:------:|-----|
| **Go service (recommended)** | ✅ | Matches Socrate (single static binary, same deploy/security posture and team expertise); first-class crypto, `net/http`, and DPoP support for Sprint 4; trivial to colocate as the SPA's edge. |
| Node/Express BFF | ➖ | Aligns with SPA tooling but adds a second runtime + npm supply-chain surface to a Tier-0 box — the opposite of what we want. |
| oauth2-proxy / generic reverse proxy | ➖ | Good for opaque SSO, but we need monitoring-specific session, CSRF, and (later) DPoP minting — not a fit off the shelf. |

The BFF ships as a **small standalone Go binary**. The production environment
already runs **Caddy** as the edge, so Caddy stays the TLS terminator, serves the
SPA static files, and routes `/bff/*` + `/api/admin/*` to the BFF — the BFF is an
**internal upstream**, not the edge. One origin (`monitoring.vandermoten.eu`),
one process to harden. *(This supersedes an earlier draft that had the BFF
replace nginx as the edge.)*

### 2.2 Deployment topology (single VPS, Caddy edge)

```
Browser ──HTTPS──► Caddy (monitoring.vandermoten.eu)
   ▲  __Host- cookie   ├── /                → file_server (monitoring SPA dist/)
   └───────────────────┴── /bff/* /api/admin/* → BFF (127.0.0.1:8090)
                                                    │ holds tokens server-side
                                                    └──► 127.0.0.1:8081  Socrate admin API (internal)
```

Subdomains: `socrate.vandermoten.eu` = OAuth server (`:8080`),
`admin.vandermoten.eu` = the admin SPA (separate frontend), `monitoring…` = this
console. The admin API (`:8081`) gets **no public subdomain** — only the BFF
reaches it, over localhost. See `bff/Caddyfile.example`.

---

## 3. Architecture

### 3.1 Login (Authorization Code + PKCE, server-side)
1. Browser hits `GET /bff/login`. BFF generates `state` + PKCE `code_verifier`,
   stores them in a short-lived pre-session keyed by a `__Host-` cookie, and
   302-redirects to Socrate `/oauth/authorize`.
2. Socrate redirects back to `GET /bff/callback?code&state`. BFF validates
   `state`, exchanges the code (+ `code_verifier`) **server-side**, receives the
   token set, creates a session, and sets an opaque `HttpOnly` session cookie.
3. Browser is redirected to the SPA. It never sees a token.

### 3.2 Authenticated API calls
- SPA calls **same-origin** `/(api|bff)/…` with `credentials: 'include'`.
- BFF resolves the session, attaches `Authorization: Bearer <access_token>` (held
  server-side), proxies to Socrate, and streams the response back (incl. SSE).
- On 401 from Socrate, the BFF refreshes using the stored refresh token
  transparently; on `403 elevation_required`, it forwards the status so the
  existing **step-up dialog** (Sprint 2) drives `/bff/elevate`.

### 3.3 Logout
- `POST /bff/logout` destroys the session, best-effort revokes the refresh token
  at Socrate, and clears the cookie.

---

## 4. Session & token custody

- **Session store:** pluggable. In-memory for single-instance dev; **Redis**
  (or Socrate's DB) for HA. Sessions hold the token set + `auth_time`, never the
  browser.
- **Cookie:** `__Host-mon_session`, `HttpOnly`, `Secure`, `SameSite=Strict`,
  `Path=/`, no `Domain`. Opaque 256-bit random id; server-side lookup only.
- **Idle + absolute timeouts:** e.g. 30 min idle / 8 h absolute, configurable.
- **At rest:** if the store is shared (Redis), encrypt the token blob with a
  server key (AES-GCM); rotate on the platform's schedule.

---

## 5. CSRF

`SameSite=Strict` blocks cross-site cookie attachment. Defense-in-depth on
state-changing routes: a **double-submit token** — BFF issues a non-`HttpOnly`
`mon_csrf` cookie; the SPA echoes it in an `X-CSRF-Token` header (already the
pattern Socrate uses with `X-Requested-By`). BFF rejects mismatches. Safe methods
(GET/HEAD) are exempt.

---

## 6. BFF API surface (minimal)

| Route | Purpose |
|-------|---------|
| `GET /bff/login` | Start Authorization-Code + PKCE |
| `GET /bff/callback` | Code exchange, create session, set cookie |
| `POST /bff/logout` | Destroy session, revoke refresh token |
| `GET /bff/session` | `{authenticated, user, roles, csrf}` for SPA bootstrap |
| `POST /bff/elevate` | Step-up passthrough → Socrate `/api/admin/elevate` |
| `ANY /api/admin/**` | Authenticated reverse-proxy to Socrate (token-injected, SSE-aware) |

**Least privilege:** the BFF's client is registered with only `monitoring:read`
+ `monitoring:write` scopes (ties to #201), so even a BFF compromise is bounded
to monitoring — not the full admin surface.

---

## 7. SPA changes

- Delete `authStore` token handling, PKCE/`exchangeCode`, refresh timer, and the
  in-memory token refs. The SPA becomes **token-unaware**.
- `useApi` drops the `Authorization` header; calls become same-origin with
  `credentials: 'include'` + the CSRF header on mutations.
- Bootstrap reads `GET /bff/session` for `{user, roles}` (role-based UI gating
  stays; the real boundary is server-side scope as always).
- Login button → `window.location = '/bff/login'`. Callback view is removed.
- The **step-up dialog stays** — it now posts to `/bff/elevate`.

---

## 8. Sender-constraint hook (Sprint 4 / #202)

With tokens server-side, the BFF→Socrate leg is the place to add **DPoP**
(RFC 9449): the BFF holds the DPoP key and mints a proof per request, so even a
server-side token leak is not freely replayable. The BFF makes this a localized
change rather than a browser-crypto problem.

---

## 9. Phased migration

1. **Phase 1 — BFF skeleton (no behavior change):** Go service that serves the
   SPA and reverse-proxies `/api` to Socrate, passing through the existing
   browser `Authorization` header. Ship behind a flag; prove the proxy + SSE path.
2. **Phase 2 — Move auth server-side:** implement `/bff/login|callback|session|
   logout`, session store, cookie. SPA switches to cookie auth; tokens leave the
   browser. **This is the milestone that closes the audit blocker.**
3. **Phase 3 — CSRF + step-up passthrough + scope-limited client (#201).**
4. **Phase 4 — DPoP on the BFF→Socrate leg (#202).**

Each phase is independently shippable and reversible behind config.

---

## 10. Alternatives considered

- **Stay SPA-only, harden more (Trusted Types enforce, SRI, tighter CSP).**
  Necessary hygiene (Sprint 1) but does not remove tokens from JS — rejected as a
  *sufficient* control for Tier-0.
- **Token Handler pattern via a generic gateway (e.g. Curity/oauth2-proxy).**
  Viable, but we need monitoring-specific session/CSRF/DPoP and SSE proxying;
  a ~few-hundred-line Go BFF we own is simpler to audit than bending a generic one.
- **Service worker token isolation.** Still in-origin JS; XSS-reachable. Rejected.

---

## 11. Decisions — resolved for the single-VPS environment (2026-06-25)

1. **Edge model:** ✅ **Caddy stays the edge** (TLS, static SPA, routing); the BFF
   is an internal upstream on `127.0.0.1:8090`, reached only via Caddy.
2. **Session store:** ✅ **Reuse the existing Postgres** (single VPS → no HA need
   yet; Redis remains a drop-in upgrade for multi-instance).
3. **Repo placement:** ✅ **`bff/` in `oauth2-monitoring`** — versioned with the SPA
   it serves (this PR).
4. **Timeouts:** proposed **30 min idle / 8 h absolute** for the SOC console
   (configurable); confirm during Phase 2.
5. **Admin-API exposure:** the admin API (`:8081`) binds **loopback only** and is
   never given a public subdomain — the BFF reaches it over localhost, so the
   Tier-0 control plane is off the public internet entirely.

---

## 12. Consequences

**Positive:** removes the entire "tokens in the browser → replay" attack class;
shrinks XSS impact to "session-bound, server-mediated, scope-limited"; unlocks
DPoP and per-route scope enforcement; one hardened Tier-0 edge.

**Cost:** a new Go service to build, deploy, and operate (session store, scaling);
SSE must be proxied with buffering disabled; an extra network hop.

**Recommendation:** approve, and start **Phase 1** (skeleton proxy) as the next PR.
