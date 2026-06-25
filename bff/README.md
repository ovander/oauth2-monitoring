# Socrate Monitoring BFF

A small **Backend-for-Frontend** for the Socrate monitoring console. Its job is
to take OAuth tokens out of the browser: the monitoring SPA holds only an
`HttpOnly` session cookie, while this service holds the tokens server-side and is
the sole client of the Socrate admin API.

Rationale and the full design are in [`../BFF-DESIGN.md`](../BFF-DESIGN.md)
(ADR-0001). This service implements that ADR in phases.

> **Status: Phase 2 (server-side sessions).** When `BFF_CLIENT_ID` is set, the
> BFF runs the OAuth Authorization-Code + PKCE flow server-side, keeps the tokens
> in a server-side session, hands the browser only an `HttpOnly` cookie, and
> **injects** the access token into proxied admin-API calls. With no session it
> falls back to Phase-1 pass-through, so the server can deploy before the SPA
> switches to cookie auth. Phases 3–4 add CSRF enforcement, a scope-limited
> client, and DPoP. The session store is in-memory (single-instance); a
> Postgres-backed store is the next step for durability/HA.

## Topology (single VPS, Caddy edge)

```
Browser ──HTTPS──► Caddy (monitoring.vandermoten.eu)
                     ├── /                → file_server  (monitoring SPA dist/)
                     └── /bff/* /api/admin/* → 127.0.0.1:8090  (this BFF)
                                                   │
                                                   └──► 127.0.0.1:8081  (Socrate admin API, internal)
```

- `socrate.vandermoten.eu` → Socrate OAuth server (`:8080`) — used by the BFF for
  the code exchange in Phase 2.
- `admin.vandermoten.eu` → the **admin SPA** (separate frontend). The admin API
  itself is internal (`:8081`) and is not given a public subdomain — the BFF
  reaches it over localhost.
- The BFF binds `127.0.0.1` by default, so it is reachable only via Caddy.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `BFF_LISTEN_ADDR` | `127.0.0.1:8090` | Address the BFF binds (localhost-only; Caddy fronts it). |
| `BFF_ADMIN_UPSTREAM` | `http://127.0.0.1:8081` | Internal base URL of the Socrate admin API. |
| `BFF_CLIENT_ID` | *(empty)* | OAuth client id. **Set this to enable Phase 2** (server-side sessions). Empty = Phase 1 pass-through. |
| `BFF_CLIENT_SECRET` | *(empty)* | Confidential client secret (server-side only). |
| `BFF_OAUTH_UPSTREAM` | `http://127.0.0.1:8080` | Internal OAuth server base URL (back-channel token exchange/refresh). |
| `BFF_OAUTH_PUBLIC_URL` | *(required if auth)* | Public OAuth base URL for the browser authorize redirect (e.g. `https://socrate.vandermoten.eu`). |
| `BFF_PUBLIC_ORIGIN` | *(required if auth)* | This console's public origin; `redirect_uri` = origin + `/bff/callback`. |
| `BFF_SCOPES` | `openid profile email` | Requested scopes. |
| `BFF_SESSION_IDLE` | `30m` | Idle session timeout. |
| `BFF_SESSION_ABSOLUTE` | `8h` | Absolute session lifetime. |
| `BFF_COOKIE_SECURE` | `true` | `Secure` attribute + `__Host-` cookie name. Set `false` only for local HTTP dev. |

## Run

```bash
cd bff
go test ./...
go run .                     # serves /bff/healthz and proxies /api/admin/*
# or
docker build -t socrate-monitoring-bff .
docker run --rm -p 127.0.0.1:8090:8090 \
  -e BFF_ADMIN_UPSTREAM=http://127.0.0.1:8081 socrate-monitoring-bff
```

Wire it into Caddy with [`Caddyfile.example`](./Caddyfile.example).

## Routes (Phase 1)

| Route | Behavior |
|-------|----------|
| `GET /bff/healthz` | Liveness probe. |
| `GET /bff/login` | Start Authorization-Code + PKCE (Phase 2). |
| `GET /bff/callback` | Server-side code exchange, create session, set cookie. |
| `GET /bff/session` | `{authenticated, user, csrf}` for SPA bootstrap. |
| `POST /bff/logout` | Destroy session, clear cookie. |
| `POST /bff/elevate` | Tier-0 step-up: re-auth at Socrate with the session token; captures the fresh token into the session (CSRF-protected; nothing to the browser). |
| `ANY /api/admin/**` | Allowlisted reverse proxy; injects the session token (Phase 2) or passes through (Phase 1), SSE-aware. |
| anything else | `404` — the BFF is an allowlist, never an open proxy. |

## Roadmap

- **Phase 1:** skeleton proxy, no behavior change. ✅
- **Phase 2 (here):** `/bff/login|callback|session|logout`, server-side sessions,
  `__Host-` `HttpOnly`/`Secure`/`SameSite=Strict` cookie, server-side token
  injection — **the milestone that removes tokens from the browser**. ✅
  *(in-memory store; Postgres-backed store is the next durability step.)*
- **Phase 2b:** Postgres-backed session store (durable / HA).
- **Phase 3:** CSRF double-submit enforcement, `/bff/elevate` step-up passthrough,
  scope-limited (`monitoring:read`/`write`) confidential client (#201).
- **Phase 4:** DPoP (RFC 9449) on the BFF → Socrate leg (#202).

> **SPA companion:** the monitoring SPA still uses bearer-token auth today; the
> dual-mode proxy keeps it working. Switching the SPA to cookie-only
> (`credentials: 'include'`, drop `authStore` tokens, `/bff/session` bootstrap,
> login → `/bff/login`) is the coordinated follow-up PR that completes Phase 2.

## Security notes

- No third-party dependencies — standard library only (minimal supply-chain
  surface, consistent with a Tier-0 component).
- Allowlist, not an open proxy: only `/bff/*` and `/api/admin/*` are served.
- Phase 2 sets `Secure` cookies based on `X-Forwarded-Proto` from Caddy and must
  trust forwarded headers only from the Caddy edge.
