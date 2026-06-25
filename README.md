# OAuth2 Security Monitor

A real-time security operations dashboard for OAuth2 / OpenID Connect servers. Built with Vue 3, Pinia, PrimeVue 4, and TypeScript.

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
> tokens; the browser never sees them. See [`BFF-DESIGN.md`](./BFF-DESIGN.md) and
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

### Docker (recommended)

```bash
# Build image
docker build \
  --build-arg VITE_ADMIN_URL=https://admin.example.com \
  --build-arg VITE_OAUTH_URL=https://auth.example.com \
  --build-arg VITE_CLIENT_ID=security-monitor \
  --build-arg VITE_REDIRECT_URI=https://monitor.example.com/callback \
  --build-arg VITE_SCOPES=openid,profile,email \
  --build-arg VITE_ADMIN_ROLES=admin,monitor_admin \
  -t oauth2-monitor:latest .

# Run (enable the /api/ proxy by setting ADMIN_URL)
docker run -p 80:80 \
  -e ADMIN_URL=http://admin-backend:8081 \
  oauth2-monitor:latest
```

### Vite build only

```bash
npm run build        # outputs to dist/
npm run preview      # preview production build locally
```

### Nginx proxy (optional)

The bundled `nginx.conf` includes a commented-out `/api/` proxy block. To enable it, set `ADMIN_URL` at runtime via `envsubst` or a Docker env variable and uncomment the block in `nginx.conf`.

---

## Testing

```bash
npm run test          # watch mode
npm run test:run      # single run (CI)
npm run test:coverage # coverage report (HTML in coverage/)
```

The test suite covers:

- **authStore** — PKCE flow, token lifecycle, RBAC, localStorage isolation
- **monitorStore** — all state mutations and computed properties
- **useApi** — auth headers, 401 retry guard, store integration
- **useSSE** — connection lifecycle, event parsing, reconnect
- **CallbackView** — state/CSRF validation, error handling
- **Integration** — end-to-end auth flow, secret isolation

---

## Security Posture

| Control | Status |
|---------|--------|
| CSRF state validation on OAuth callback | ✅ |
| Public PKCE client — no client secret in the browser | ✅ |
| Tokens in-memory only (not `sessionStorage`) | ✅ |
| Role-based access control via JWT claims | ✅ |
| Token refresh loop protection (`retried` flag) | ✅ |
| Content Security Policy (meta + nginx header) | ✅ |
| HTTPS enforcement warning for non-localhost | ✅ |
| Security headers via nginx (HSTS, X-Frame, etc.) | ✅ |
| `npm audit` — 0 known vulnerabilities | ✅ |

---

## Project Structure

```
src/
├── components/
│   └── ErrorBoundary.vue      # Global error boundary
├── composables/
│   ├── useApi.ts              # Authenticated fetch + API methods
│   └── useSSE.ts              # Server-Sent Events client
├── router/
│   └── index.ts               # Route guards (auth + RBAC)
├── stores/
│   ├── authStore.ts           # Auth state, PKCE, token management
│   └── monitorStore.ts        # Dashboard data state
├── views/
│   ├── SetupView.vue          # Pre-login server URL wizard
│   ├── LoginView.vue          # OAuth2 login trigger
│   ├── CallbackView.vue       # OAuth2 callback + CSRF guard
│   ├── DashboardView.vue      # Main dashboard
│   ├── SettingsView.vue       # Post-login settings (in-memory)
│   └── UnauthorisedView.vue   # Access denied page
└── __tests__/                 # Vitest test suite
```
