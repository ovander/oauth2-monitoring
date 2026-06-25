# Socrate Monitoring BFF

A small **Backend-for-Frontend** for the Socrate monitoring console. Its job is
to take OAuth tokens out of the browser: the monitoring SPA holds only an
`HttpOnly` session cookie, while this service holds the tokens server-side and is
the sole client of the Socrate admin API.

Rationale and the full design are in [`../BFF-DESIGN.md`](../BFF-DESIGN.md)
(ADR-0001). This service implements that ADR in phases.

> **Status: Phase 1.** Transparent, allowlisted reverse proxy in front of the
> admin API — it proves the proxy + SSE path with **no behavior change** (the
> browser still sends its own bearer token, forwarded unchanged). Phases 2–4 add
> server-side sessions/token-injection, CSRF, scope-limited client, and DPoP.

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
| `ANY /api/admin/**` | Allowlisted reverse proxy to the Socrate admin API (SSE-aware). |
| anything else | `404` — the BFF is an allowlist, never an open proxy. |

## Roadmap

- **Phase 1 (here):** skeleton proxy, no behavior change.
- **Phase 2:** `/bff/login|callback|session|logout`, Postgres-backed sessions,
  `__Host-` `HttpOnly`/`Secure`/`SameSite=Strict` cookie, server-side token
  injection — **the milestone that removes tokens from the browser**.
- **Phase 3:** CSRF double-submit, `/bff/elevate` step-up passthrough, and a
  scope-limited (`monitoring:read`/`write`) confidential client (#201).
- **Phase 4:** DPoP (RFC 9449) on the BFF → Socrate leg (#202).

## Security notes

- No third-party dependencies — standard library only (minimal supply-chain
  surface, consistent with a Tier-0 component).
- Allowlist, not an open proxy: only `/bff/*` and `/api/admin/*` are served.
- Phase 2 sets `Secure` cookies based on `X-Forwarded-Proto` from Caddy and must
  trust forwarded headers only from the Caddy edge.
