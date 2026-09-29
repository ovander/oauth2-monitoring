# Socrate Monitor — OAuth2 Security Monitoring Console

A real-time security operations dashboard for the [Socrate](https://github.com/ovander/go-oauth2) OAuth2 / OpenID Connect server. Built with Vue 3, Pinia, PrimeVue 4, and TypeScript, behind a Go Backend-for-Frontend.

---

## Table of Contents

- [Features](#features)
- [Quick Start (Development)](#quick-start-development)
- [Environment Variables](#environment-variables)
- [Production Build](#production-build)
- [Testing](#testing)
- [Security Posture](#security-posture)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

- **Live event stream** — Server-Sent Events feed of login attempts, token grants, and anomalies
- **Threat dashboard** — at-a-glance stats, threat level, blocked IPs, and alert rules
- **No tokens in the browser** — authentication is handled by the **BFF** (`bff/`); the SPA holds only an `HttpOnly` session cookie and calls the admin API same-origin with `credentials: 'include'`
- **Role-based access** — only users with the configured admin roles can access the dashboard
- **Tier-0 step-up** — destructive actions require a recent re-authentication, performed through the BFF (`/bff/elevate`)

> **Architecture:** The SPA is served behind Caddy, which routes `/bff/*` and
> `/api/admin/*` to the Go **Backend-for-Frontend** in [`bff/`](./bff). The BFF
> runs the OAuth 2.1 Authorization-Code + PKCE flow server-side and holds the
> tokens; the browser never sees them. See [ADR-0001](docs/adr/0001-backend-for-frontend.md) and
> [`deploy/`](./deploy).

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Run the BFF (in another terminal) — see bff/README.md.
#    With BFF_CLIENT_ID set it does server-side OAuth; without it, it proxies.

# 3. Start the dev server (http://localhost:5180). Vite proxies /bff and /api
#    to the BFF (DEV_BFF_TARGET, default http://127.0.0.1:8090).
npm run dev
```

Sign-in hands off to the BFF (`/bff/login`); the OAuth flow and callback are
entirely server-side, so there is no in-SPA wizard, callback page, or token
storage.

---

## Environment Variables

Server URLs, the OAuth client, and scopes are owned by the **BFF**, not the SPA
(see [`bff/README.md`](./bff/README.md)). The SPA build only needs the role lists:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ADMIN_ROLES` | `admin,monitor_admin` | Comma-separated roles that grant full (write) dashboard access |
| `VITE_VIEWER_ROLES` | `monitor_viewer` | Comma-separated roles that grant read-only access |
| `DEV_BFF_TARGET` | `http://127.0.0.1:8090` | (dev only) Vite proxy target for `/bff` and `/api` |

> **Security note:** the monitoring console holds **no OAuth tokens and no client
> secret** in the browser. The BFF is a confidential client; the SPA is a
> token-less cookie client.

---

## Production Build

### Deploy kit (recommended)

Production deployment is the single-VPS kit in [`deploy/`](deploy/): Caddy is
the only public listener, the built SPA is served from a root-owned directory
and the Go BFF runs as a hardened systemd unit. Build locally, then
`VPS_HOST=user@host deploy/scripts/push.sh` — see
[`deploy/README.md`](deploy/README.md).

The earlier root `Dockerfile` / `nginx.conf` / `.env.production` described the
retired browser-held-token architecture (a public PKCE client hitting the admin
API directly) and were removed (P3-25). The BFF still ships its own distroless
image: `docker build -t socrate-monitoring-bff bff/`.

### Vite build only

```bash
npm run build        # outputs to dist/
npm run preview      # preview production build locally
```

---

## Testing

```bash
npm run test          # watch mode
npm run test:run      # single run (CI)
npm run test:coverage # coverage report (HTML in coverage/)
```

The test suite covers:

- **authStore** — session bootstrap from `/bff/session`, network failures, viewer/admin role gating, step-up
- **monitorStore** — all state mutations and computed properties
- **useApi** — cookie credentials with **no** `Authorization` header, `X-CSRF-Token` on mutating calls only, 401 handling
- **useSSE** — same-origin cookie connection, event parsing, reconnect
- **usePolicyDecisions** and **policy** utils — decision-log filters, paging and labels
- **Integration** — the cookie-session flow end to end: bootstrap, role gating, logout

The BFF has its own Go test suite: `cd bff && go test -race ./...`.

---

## Security Posture

| Control | Where |
|---------|-------|
| No OAuth token or client secret in the browser — the BFF holds them server-side | `bff/`, tested in `useApi.test.ts` / `useSSE.test.ts` |
| `__Host-` session cookie: `HttpOnly`, `Secure`, `SameSite=Strict` | BFF (`backendkit/bff`) |
| No valid session ⇒ 401; mutating calls need `X-CSRF-Token` ⇒ else 403 | BFF gateway |
| Allowlist proxy (`/bff/*`, `/api/admin/*`); non-canonical paths refused | `bff/server.go` |
| Login bound to the browser that started it (login CSRF / session swap) | `bff/auth.go` |
| Step-up for destructive actions, elevated token kept server-side | `/bff/elevate` |
| Per-IP budgets on login and step-up; `X-Forwarded-For` trusted only from loopback | `bff/ratelimit.go` |
| Logout revokes the tokens at the issuer (RFC 7009) | `bff/auth.go` |
| Content Security Policy and security headers | `deploy/Caddyfile`, `index.html` |
| Dependency advisories gate CI (`npm-audit-gate.sh`, high/critical) | `.github/workflows/ci.yml` |

The full list, the deployment requirements and how to report a vulnerability are in
[SECURITY.md](SECURITY.md).

---

## Project Structure

```
bff/                            # Go Backend-for-Frontend (confidential OAuth client, session→bearer proxy)
deploy/                         # Caddy site, systemd units, build/ship/install scripts
docs/adr/                       # Architecture decision records (ADR-0001: the BFF)
src/
├── components/
│   ├── ErrorBoundary.vue       # Global error boundary
│   ├── StepUpDialog.vue        # Re-authentication dialog for Tier-0 actions
│   └── VersionBadge.vue        # Console and server versions
├── composables/
│   ├── useApi.ts               # Same-origin cookie fetch (+ X-CSRF-Token) and API methods
│   ├── useSSE.ts               # Server-Sent Events client (same-origin, cookie)
│   ├── usePolicyDecisions.ts   # State behind the access-policy decision log
│   ├── useVersionCheck.ts      # Stale-tab detection after a deploy
│   └── useVersionInfo.ts       # Read-only version info for components
├── router/
│   └── index.ts                # Route guards (auth + viewer/admin roles)
├── stores/
│   ├── authStore.ts            # Session bootstrap from /bff/session, roles
│   ├── monitorStore.ts         # Dashboard data state
│   ├── stepUpStore.ts          # Coordinates the step-up dialog and retry
│   └── version.ts              # Build-time version constants
├── utils/
│   ├── logger.ts               # Central logger (loglevel)
│   └── policy.ts               # Labels for policy decisions
├── views/                      # Viewer (read-only): Dashboard, Events, Threats, Sessions,
│                               #   Tokens, Reports, Geo, PolicyDecisions
│                               # Admin (write): Alerts, BlockedIPs, AuditLogs, Settings
│                               # Public: Login (hands off to /bff/login), Unauthorised
└── __tests__/                  # Vitest test suite
```

---

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the development setup, the
security rules this console must keep, the required checks and the pull-request flow. Notable
changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Security

Please report vulnerabilities privately through the repository's **Security** tab → **Report a
vulnerability**, not in a public issue. See [SECURITY.md](SECURITY.md).

## License

The monitoring console is licensed under the [Apache License 2.0](LICENSE).
