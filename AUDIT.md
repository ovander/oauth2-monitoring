# OAuth2 Monitor SPA — Production Readiness Audit

**Initial audit date:** 2026-03-01
**Remediation completed:** 2026-03-01
**Auditor:** Cowork / Claude
**Verdict:** ✅ **GO** — All Critical and High findings resolved. Zero open blockers.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Scope](#scope)
3. [Findings & Remediation Status](#findings--remediation-status)
   - [Security](#security-findings)
   - [Code Quality & Correctness](#code-quality--correctness-findings)
   - [Production Readiness](#production-readiness-findings)
   - [Dependency & Supply Chain](#dependency--supply-chain-findings)
4. [Summary Table](#summary-table)
5. [Verification](#verification)

---

## Executive Summary

An initial audit of `oauth2-monitor` identified 3 Critical, 5 High, 4 Medium, and 5 Low/Info findings that prevented production deployment. A full remediation pass was subsequently performed on the same codebase. All Critical and High findings have been resolved. The remaining Low/Info items were addressed as part of the same work. The application is **ready for production deployment** subject to the operational notes in the README.

**Key changes made:**

- Restructured the app so OAuth client credentials (clientId, clientSecret, scopes) are configured post-login in an authenticated Settings page, never in the pre-login wizard
- All tokens are now in-memory only — nothing sensitive persists to `sessionStorage` or `localStorage`
- Full PKCE `state` CSRF validation on the callback
- Role-based access control via JWT role claims, configurable via `VITE_ADMIN_ROLES`
- Multi-stage `Dockerfile`, `nginx.conf` with CSP + security headers, `.env.example`, and deployment `README.md`
- Vitest test suite with 85 tests covering stores, composables, views, and end-to-end auth flows
- `npm audit`: **0 vulnerabilities**
- TypeScript (`vue-tsc -b`): **0 errors**

---

## Scope

| Area | Covered |
|------|---------|
| Security — auth flow, token handling, CSRF/XSS surface | ✅ |
| Code quality — bugs, dead code, TypeScript correctness | ✅ |
| Production readiness — build, deployment, HTTPS, CSP | ✅ |
| Dependency & supply chain | ✅ |

Files reviewed: `src/**` (all source files), `package.json`, `vite.config.ts`, `tsconfig*.json`, `Dockerfile`, `nginx.conf`.

---

## Findings & Remediation Status

### Security Findings

---

#### SEC-01 · CRITICAL — OAuth `state` parameter not validated on callback ✅ FIXED

**File:** `src/views/CallbackView.vue`

**Original issue:** The `CallbackView` extracted the `code` from the URL but never read or validated the `state` parameter, making the callback vulnerable to OAuth2 CSRF attacks.

**Fix applied:** Before calling `exchangeCode`, the view now reads `route.query.state`, compares it to `sessionStorage.getItem('oauth_state')`, and aborts with a descriptive error message if they do not match. The `oauth_state` key is always cleared from `sessionStorage` regardless of the outcome.

```ts
const state = route.query.state as string
const storedState = sessionStorage.getItem('oauth_state')
sessionStorage.removeItem('oauth_state') // always clear
if (!state || !storedState || state !== storedState) {
  error.value = 'Invalid state parameter — possible CSRF attack. Please sign in again.'
  return
}
```

**Test coverage:** `src/__tests__/components/CallbackView.test.ts` — CSRF state mismatch and missing state cases.

---

#### SEC-02 · CRITICAL — Client secret stored in `localStorage` ✅ FIXED

**File:** `src/stores/authStore.ts`

**Original issue:** The full `MonitorConfig` including `clientSecret` was serialised to `localStorage` on every config update.

**Fix applied:** `updateConfig()` destructures `clientSecret` out before writing to storage. `loadStoredConfig()` also destructures it out on read, ensuring the secret can never be restored from storage. The secret lives only in the reactive Pinia ref for the lifetime of the browser tab.

```ts
// updateConfig — never writes secret to localStorage
const { clientSecret: _secret, ...persistable } = config.value
localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))

// loadStoredConfig — never restores secret from storage
const { clientSecret: _omit, ...safe } = parsed
config.value = { ...config.value, ...safe }
```

**Architecture change:** Client credentials (clientId, clientSecret, scopes) have been moved out of the pre-login setup wizard entirely. They are entered in the authenticated `SettingsView` and kept in-memory only, never written to any persistent storage.

**Test coverage:** `src/__tests__/integration/auth-flow.test.ts` — `clientSecret isolation` suite verifies the secret is never found in `localStorage`.

---

#### SEC-03 · HIGH — No role-based access control ✅ FIXED

**File:** `src/router/index.ts`, `src/stores/authStore.ts`

**Original issue:** The router guard only checked `isAuthenticated`. Any OAuth user, regardless of role, had full admin access.

**Fix applied:** Added `isAdmin` computed property to the auth store, derived from the `roles` array in the decoded JWT payload against a configurable `VITE_ADMIN_ROLES` environment variable (default: `admin,monitor_admin`). The router `beforeEach` guard now checks `isAdmin` for all `requiresAuth` routes and redirects unauthorised users to `/unauthorised`.

```ts
// router/index.ts
const hasAdminRole = ADMIN_ROLES.length === 0 || userRoles.some(r => ADMIN_ROLES.includes(r))
if (!hasAdminRole) return next('/unauthorised')
```

**New files:** `src/views/UnauthorisedView.vue` — access denied page shown to authenticated non-admin users.

**Test coverage:** `src/__tests__/unit/stores/authStore.test.ts` — `isAdmin` suite with admin role, monitor_admin role, and viewer role cases.

---

#### SEC-04 · HIGH — Tokens stored in `sessionStorage` as plaintext JSON ✅ FIXED

**File:** `src/stores/authStore.ts`

**Original issue:** Access, refresh, and ID tokens were persisted as a plaintext JSON blob in `sessionStorage`, accessible to XSS and browser extensions.

**Fix applied:** `setTokens()` no longer writes to `sessionStorage`. All tokens are held exclusively in reactive Pinia refs (`accessToken`, `refreshToken`, `idToken`) which exist only in JS memory for the lifetime of the tab. On page reload, the user is required to re-authenticate.

**Test coverage:** `src/__tests__/integration/auth-flow.test.ts` — `code exchange stores tokens in-memory only` verifies no token data is written to `sessionStorage`.

---

#### SEC-05 · MEDIUM — `fetchWithAuth` susceptible to infinite recursion on repeated 401s ✅ FIXED

**File:** `src/composables/useApi.ts`

**Original issue:** On a 401, `fetchWithAuth` refreshed the token and called itself without a retry limit, risking a stack overflow if the server kept returning 401.

**Fix applied:** Added a `retried = false` parameter. The refresh and retry only occurs when `!retried`; the recursive call passes `true`, preventing any further retry.

```ts
async function fetchWithAuth(url: string, options: RequestInit = {}, retried = false): Promise<Response> {
  ...
  if (response.status === 401 && !retried) {
    await authStore.refreshAccessToken()
    return fetchWithAuth(url, options, true)
  }
}
```

**Test coverage:** `src/__tests__/unit/composables/useApi.test.ts` — `retries once on 401` and `does not retry a second time` cases.

---

#### SEC-06 · LOW — `getAuthorizationUrl()` dead code with unsafe type cast ✅ FIXED

**File:** `src/stores/authStore.ts`

**Original issue:** A synchronous `getAuthorizationUrl()` function cast an async `Promise<string>` to `string`, which would silently produce `[object Promise]` if called.

**Fix applied:** The dead function has been deleted entirely. Only `getAuthorizationUrlAsync()` remains.

---

### Code Quality & Correctness Findings

---

#### CQ-01 · MEDIUM — Token expiry not enforced ✅ FIXED

**File:** `src/stores/authStore.ts`

**Fix applied:** `setTokens()` now records `tokenExpiresAt = Date.now() + expiresIn * 1000`. `scheduleRefresh()` uses `setTimeout` to proactively call `refreshAccessToken()` 60 seconds before expiry. `SettingsView` displays a live countdown using this value.

---

#### CQ-02 · MEDIUM — `base64UrlEncode` fragile spread pattern ✅ FIXED

**File:** `src/stores/authStore.ts`

**Fix applied:** Replaced `String.fromCharCode(...array)` (spread to function args, stack overflow risk) with `Array.from(array, b => String.fromCharCode(b)).join('')`.

---

#### CQ-03 · LOW — SetupView accepts 401/403 from health endpoint without content-type check ✅ FIXED

**File:** `src/views/SetupView.vue`

**Fix applied:** When a 401 or 403 is received, the health check now validates that `Content-Type` includes `application/json` before accepting it as a plausible OAuth server response. Non-JSON 401s (from proxies, firewalls, or wrong URLs) are treated as errors.

---

#### CQ-04 · LOW — `as SecurityEvent` cast hides type mismatch in `useSSE` ✅ FIXED

**File:** `src/composables/useSSE.ts`

**Fix applied:** Both the `security_event` and `alert` cases in `processEvent` now build `SecurityEvent` objects explicitly with all required and optional fields mapped by name (`user_email`, `app_id`, `app_name`, `user_agent`). No casts are used, allowing the TypeScript compiler to verify structural correctness.

---

#### CQ-05 · INFO — App version stuck at `0.0.0` ✅ FIXED

**Fix applied:** `package.json` version bumped to `1.0.0-rc.1`.

---

### Production Readiness Findings

---

#### PR-01 · CRITICAL — No production deployment configuration ✅ FIXED

**Fix applied:** Added:

- `Dockerfile` — multi-stage build: `node:22-alpine` (npm ci + `vite build`) → `nginx:1.27-alpine` (serves `dist/`)
- `nginx.conf` — SPA history-mode fallback, security headers, CSP, optional `/api/` proxy block, static asset caching, `/health` endpoint
- `.env.example` — documents all `VITE_*` build variables with descriptions and warnings
- `README.md` — full deployment guide covering Docker build args, environment variables, nginx proxy setup, and quick-start instructions

---

#### PR-02 · HIGH — No Content Security Policy ✅ FIXED

**Fix applied:** CSP is enforced at two layers:

1. `index.html` — `<meta http-equiv="Content-Security-Policy">` for development and fallback (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' ws: wss:;`)
2. `nginx.conf` — `add_header Content-Security-Policy` response header overrides the meta tag in production (preferred, as it covers navigation requests)

---

#### PR-03 · HIGH — No HTTPS enforcement ✅ FIXED

**Fix applied:** The setup wizard now displays a warning banner when a non-localhost `http://` URL is entered. The `nginx.conf` includes `Strict-Transport-Security` (HSTS) and `X-Frame-Options: DENY` headers. The README instructs operators to terminate TLS at the reverse-proxy layer.

---

#### PR-04 · MEDIUM — No `.env.example` or deployment documentation ✅ FIXED

**Fix applied:** See PR-01 — `.env.example` and `README.md` both created.

---

#### PR-05 · LOW — No error boundaries in Vue views ✅ FIXED

**Fix applied:** Added `src/components/ErrorBoundary.vue` — a Vue 3 component using `onErrorCaptured` that catches rendering exceptions from any descendant and shows a fallback UI with the error message and a reload button. `App.vue` wraps `<RouterView>` with `<ErrorBoundary>`.

---

### Dependency & Supply Chain Findings

---

#### DEP-01 · HIGH — `rollup` 4.54.0 path traversal vulnerability ✅ FIXED

**Advisory:** [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc)

**Fix applied:** `npm audit fix` bumped rollup from `4.54.0` → `4.59.0`. `npm audit` now reports **0 vulnerabilities**.

---

#### DEP-02 · INFO — All production dependencies current

No action required. All production dependencies remain at latest stable releases.

---

## Summary Table

| ID | Area | Severity | Title | Status |
|----|------|----------|-------|--------|
| SEC-01 | Security | 🔴 Critical | OAuth `state` not validated — CSRF risk | ✅ Fixed |
| SEC-02 | Security | 🔴 Critical | Client secret persisted to `localStorage` | ✅ Fixed |
| PR-01  | Production | 🔴 Critical | No production deployment configuration | ✅ Fixed |
| SEC-03 | Security | 🟠 High | No role-based access control | ✅ Fixed |
| SEC-04 | Security | 🟠 High | Tokens stored as plaintext in `sessionStorage` | ✅ Fixed |
| PR-02  | Production | 🟠 High | No Content Security Policy | ✅ Fixed |
| PR-03  | Production | 🟠 High | No HTTPS enforcement | ✅ Fixed |
| DEP-01 | Dependencies | 🟠 High | `rollup` path traversal vulnerability (build-time) | ✅ Fixed |
| SEC-05 | Security | 🟡 Medium | `fetchWithAuth` infinite recursion on repeated 401 | ✅ Fixed |
| CQ-01  | Code Quality | 🟡 Medium | Token expiry not enforced | ✅ Fixed |
| CQ-02  | Code Quality | 🟡 Medium | `base64UrlEncode` fragile spread pattern | ✅ Fixed |
| CQ-03  | Code Quality | 🟡 Medium | Health-check 401 treated as connection success | ✅ Fixed |
| PR-04  | Production | 🟡 Medium | No `.env.example` or deployment documentation | ✅ Fixed |
| SEC-06 | Security | 🔵 Low | Dead `getAuthorizationUrl()` with unsafe type cast | ✅ Fixed |
| CQ-04  | Code Quality | 🔵 Low | `as SecurityEvent` cast hides type mismatch | ✅ Fixed |
| PR-05  | Production | 🔵 Low | No error boundaries in Vue views | ✅ Fixed |
| CQ-05  | Code Quality | ⚪ Info | App version stuck at `0.0.0` | ✅ Fixed (→ 1.0.0-rc.1) |
| DEP-02 | Dependencies | ⚪ Info | All prod deps current, no other CVEs | ✅ No action needed |

**Open findings: 0**

---

## Verification

Final verification commands run after all remediation work:

```
npm run test:run
```
```
Test Files  6 passed (6)
      Tests  85 passed (85)
   Duration  5.70s
```

```
npm run build
```
```
vue-tsc -b          ← 0 TypeScript errors
vite build          ← 653 modules transformed, built in 2.12s
```

```
npm audit
```
```
found 0 vulnerabilities
```

**Verdict: ✅ GO for production deployment.**

---

*Audit and remediation performed by static code review. No dynamic/penetration testing was conducted. Backend API security (the Go admin server) is out of scope for this review.*
