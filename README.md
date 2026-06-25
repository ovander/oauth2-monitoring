# OAuth2 Security Monitor

A real-time security operations dashboard for OAuth2 / OpenID Connect servers. Built with Vue 3, Pinia, PrimeVue 4, and TypeScript.

---

## Features

- **Live event stream** — Server-Sent Events feed of login attempts, token grants, and anomalies
- **Threat dashboard** — at-a-glance stats, threat level, blocked IPs, and alert rules
- **PKCE login flow** — authorisation code + PKCE (`S256`) with CSRF state validation
- **Role-based access** — only users with the configured admin roles can access the dashboard
- **Post-login settings** — OAuth client credentials are entered *after* authentication and kept in-memory only (never persisted to `localStorage`)

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set VITE_ADMIN_URL and VITE_OAUTH_URL to your server addresses

# 3. Start dev server (http://localhost:5181)
npm run dev
```

### First-run wizard

Navigate to `http://localhost:5181` and complete the setup wizard:

1. **Server URLs** — enter your Admin API base URL and OAuth2 server URL
2. **Verify connection** — the app checks both endpoints are reachable
3. **Confirm** — proceed to the login page

After logging in, open **Settings** (cog icon in the sidebar) to configure your OAuth client credentials for the current session.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ADMIN_URL` | `http://localhost:8081` | Admin API base URL |
| `VITE_OAUTH_URL` | `http://localhost:8080` | OAuth2 / OIDC server URL |
| `VITE_CLIENT_ID` | `security-monitor` | OAuth2 client ID |
| `VITE_REDIRECT_URI` | `http://localhost:5181/callback` | Authorisation callback URL |
| `VITE_SCOPES` | `openid,profile,email` | Comma-separated requested scopes |
| `VITE_ADMIN_ROLES` | `admin,monitor_admin` | Comma-separated JWT roles that grant dashboard access |

> **Security note:** Never set `VITE_CLIENT_SECRET` as a build-time variable. The client secret is entered in-memory via the post-login Settings page and is never written to `localStorage`.

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
| `clientSecret` excluded from `localStorage` | ✅ |
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
