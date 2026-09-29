# Security policy

The Socrate monitoring console is a **Tier-0** surface of the Socrate suite: it shows the live
security event stream of Socrate, the suite's OAuth 2.1 / OpenID Connect server
(`ovander/go-oauth2`, not public yet), and lets operators act on it (block IPs, manage alert
rules). It is a Vue SPA plus a small Go **Backend-for-Frontend** (`bff/`), and it must not become
a way into the Socrate admin API. Security reports are welcome and handled first.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting**: the repository's **Security** tab →
**Report a vulnerability**. Do not open a public issue or pull request for a vulnerability.

Include what you found, how to reproduce it, and the version or commit you tested.

You will get an acknowledgement within a week. Fixes are released as soon as they are ready, and
the report is credited in the release notes unless you prefer otherwise.

## Scope

- In scope: the monitoring SPA, its BFF (`bff/`) — sessions, cookies, CSRF, the proxy allowlist,
  step-up, the event stream — and the deployment files in `deploy/`.
- Out of scope: the Socrate identity provider and its admin API (`ovander/go-oauth2`, not public
  yet), the shared `backendkit` library
  ([`ovander/backendkit`](https://github.com/ovander/backendkit)), denial-of-service by volume,
  and findings that need a compromised operator device.

## Supported versions

Only the latest release receives security fixes. The repository has no tagged release yet, so
fixes land on `main`.

---

The rest of this document records the security posture: the controls enforced in code and the
deployment requirements the host must provide. The design is recorded in
[ADR-0001](docs/adr/0001-backend-for-frontend.md).

## Architecture in one paragraph

Caddy is the only public listener. It serves the built SPA and reverse-proxies `/bff/*` and
`/api/admin/*` to the BFF on `127.0.0.1:8090`. The BFF is the confidential OAuth client: it runs
Authorization Code + PKCE server-side, keeps the tokens in a server-side session, and gives the
browser only an opaque `__Host-` cookie. Every console call, including the Server-Sent Events
stream, is a same-origin cookie request; the BFF injects the bearer and is the only client of the
loopback-only admin API. The browser never holds a token, so an XSS or a poisoned dependency
cannot exfiltrate a replayable credential.

## BFF controls (`bff/`, enforced in code)

- **Sessions are mandatory.** The BFF refuses to start without `BFF_CLIENT_ID`. The only
  override, `BFF_PHASE1_PASSTHROUGH=true`, exists for a migration from browser-held tokens; it and
  `BFF_ALLOW_PASSTHROUGH` are logged as startup warnings and must not be used in production.
- **Allowlist, never an open proxy.** Only `/bff/*` and `/api/admin/*` are served; anything else
  is 404. Paths that are not already canonical (`..`, `.`, `//`, or percent-encoded dot-segments
  such as `%2e%2e`) are refused before routing, so the allowlist and the upstream decide on the
  same string.
- **Fail-closed proxy.** No valid session ⇒ 401. Mutating methods need the session's
  `X-CSRF-Token` (constant-time compare) ⇒ otherwise 403. Logout needs it too.
- **Cookies.** The session cookie is `HttpOnly`, `Secure`, `SameSite=Strict` and `__Host-`
  prefixed. `BFF_COOKIE_SECURE=false` is accepted only with an `http://` public origin (local
  development).
- **Login bound to the browser.** `/bff/login` sets a short-lived nonce cookie stored with the
  pending state; `/bff/callback` completes only for the browser that presents it, which defeats
  login CSRF and session swapping.
- **Token refresh** is coalesced per session, detached from the triggering request and written
  through to the session store; only a refresh the issuer rejects ends the session, while an
  outage answers a retryable 502.
- **Step-up** (`/bff/elevate`) re-authenticates at Socrate and keeps the elevated token in the
  session; it never reaches the browser.
- **Per-IP budgets** on `/bff/login` and `/bff/elevate`. `X-Forwarded-For` is honoured only when
  the TCP peer is loopback (Caddy, which replaces any client-supplied value); from any other peer
  it is ignored. Client-supplied IP-attribution headers are stripped before proxying.
- **Logout revokes** the refresh and access tokens at the issuer (RFC 7009, best effort), then
  deletes the session and clears the cookie; a failed server-side delete answers
  `500 logout_incomplete` rather than pretending.
- **Durable sessions** are optional (`BFF_SESSION_DSN`, Postgres) for restarts and several
  instances; the default store is in memory.

## SPA controls (enforced in code and tests)

- **No tokens in the browser.** API and SSE calls use `credentials: 'include'` and never set an
  `Authorization` header; nothing is kept in `localStorage` or `sessionStorage`. Unit tests assert
  both (`useApi.test.ts`, `useSSE.test.ts`).
  The only cookie the SPA writes itself is `theme` (`light`/`dark`, `SameSite=Strict`, `Secure`
  over HTTPS): a display preference, never sent anywhere that acts on it (`themeStore.test.ts`).
- **CSRF.** Mutating requests carry `X-CSRF-Token` from the `/bff/session` bootstrap; safe
  requests do not (tested).
- **No XSS sinks** in the source: no `v-html`, `innerHTML` or `eval`.
- **Content Security Policy** in `index.html` and, authoritatively, in the Caddy site
  (`deploy/Caddyfile`), with the other security headers.

## Automated gates (CI)

```bash
./scripts/npm-audit-gate.sh --omit=dev           # fails on a high/critical advisory, or no audit data
npm run test:run                                 # SPA unit tests (Vitest)
npm run build                                    # vue-tsc type check + production build
(cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...)   # BFF; lint v2.14.0
```

## Deployment requirements (host-provided)

See [`deploy/`](deploy/README.md) for the Caddy site, systemd units and scripts.

- Caddy is the only public listener; the BFF binds `127.0.0.1:8090` and the admin API stays on
  loopback. Do not set Caddy `trusted_proxies` unless a further proxy sits in front of it.
- The BFF runs as its own unprivileged user (`socrate-mon-bff`); its secrets
  (`BFF_CLIENT_SECRET`, `BFF_SESSION_DSN`) live only in `/etc/socrate/bff.env`, readable by root
  and that user.
- The served SPA files are root-owned and read-only to Caddy and the BFF user.
