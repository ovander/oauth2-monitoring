# Socrate monitoring BFF

> The Backend-for-Frontend that keeps OAuth tokens out of the monitoring console's browser.

This Go service is the confidential OAuth client of the Socrate monitoring console. It runs the
Authorization Code + PKCE flow server-side, keeps the tokens in a server-side session, gives the
browser only an opaque `HttpOnly` session cookie, and injects the access token into the calls it
proxies to the Socrate admin API, including the Server-Sent Events stream. It is the only client
of that loopback-only API for this console. The rationale is recorded in
[ADR-0001](../docs/adr/0001-backend-for-frontend.md); the session, cookie, CSRF and proxy runtime
comes from the `bff` package of [`ovander/backendkit`](https://github.com/ovander/backendkit).

A request without a valid session gets `401`; an unsafe method without the session's
`X-CSRF-Token` gets `403`. Sessions are in memory by default, or in Postgres with
`BFF_SESSION_DSN`.

## Topology

```
Browser ──HTTPS──► Caddy (monitor.example.com)
                     ├── /                        → file_server (built SPA, dist/)
                     └── /bff/*, /api/admin/*     → 127.0.0.1:8090 (this BFF)
                                                        ├──► 127.0.0.1:8081  Socrate admin API
                                                        └──► 127.0.0.1:8080  Socrate OAuth server
```

- `socrate.example.com` is the public Socrate OAuth server: the browser is redirected there to
  sign in (`BFF_OAUTH_PUBLIC_URL`). The BFF reaches the same server over loopback
  (`BFF_OAUTH_UPSTREAM`) for the code exchange, refresh and revocation.
- The admin API (`:8081`) has no public host name; only the console BFFs reach it, over loopback.
- The BFF binds `127.0.0.1` by default, so it is reachable only through Caddy.

## Configuration

All settings come from the environment. The production template is
[`deploy/env/bff.env.example`](../deploy/env/bff.env.example).

| Variable | Description | Default / example |
|---|---|---|
| `BFF_CLIENT_ID` | Client id of the confidential OAuth client registered in Socrate. **Required**: without it the BFF refuses to start (see [Migration-only pass-through](#migration-only-pass-through)). | *(empty)* |
| `BFF_CLIENT_SECRET` | Client secret; server-side only. **Required** with `BFF_CLIENT_ID`. | *(empty)* |
| `BFF_OAUTH_PUBLIC_URL` | Public base URL of Socrate, used for the browser's `/oauth/authorize` redirect. **Required** with `BFF_CLIENT_ID`. | e.g. `https://socrate.example.com` |
| `BFF_PUBLIC_ORIGIN` | This console's public origin; the redirect URI is this origin + `/bff/callback`. **Required** with `BFF_CLIENT_ID`. | e.g. `https://monitor.example.com` |
| `BFF_LISTEN_ADDR` | Address the BFF binds. | `127.0.0.1:8090` |
| `BFF_ADMIN_UPSTREAM` | Internal base URL of the Socrate admin API. | `http://127.0.0.1:8081` |
| `BFF_OAUTH_UPSTREAM` | Internal base URL of the Socrate OAuth server (token exchange, refresh, revocation). | `http://127.0.0.1:8080` |
| `BFF_SCOPES` | Requested scopes, space-separated. Socrate also accepts the least-privilege `monitoring:read` and `monitoring:write`. | `openid profile email` |
| `BFF_SESSION_IDLE` | Idle session timeout (Go duration, must be positive). | `30m` |
| `BFF_SESSION_ABSOLUTE` | Absolute session lifetime (Go duration, must be positive). | `8h` |
| `BFF_SESSION_DSN` | Postgres DSN for the durable session store (survives restarts, several instances). Empty uses the in-memory store (one instance). | *(empty)* |
| `BFF_COOKIE_SECURE` | `Secure` attribute and `__Host-` cookie name. `false` is accepted only with an `http://` `BFF_PUBLIC_ORIGIN` (local development). | `true` |
| `BFF_LOGIN_RATE` | Per-IP budget for `/bff/login`, in requests per minute; over budget answers `429` with `Retry-After`. A value that is not a positive integer falls back to the default. | `10` |
| `BFF_ELEVATE_RATE` | Per-IP budget for `/bff/elevate`, in requests per minute (password and MFA guessing). Same rules as `BFF_LOGIN_RATE`. | `5` |
| `BFF_ALLOW_PASSTHROUGH` | With sessions on, forward session-less requests with their own `Authorization` header and no CSRF check instead of `401`. Migration only; logged as a warning at startup. | `false` |
| `BFF_PHASE1_PASSTHROUGH` | Run without sessions at all (see below). Migration only; logged as a warning at startup. | `false` |

Booleans accept `1/true/yes/on` and `0/false/no/off`. The BFF also refuses to start when
`BFF_ADMIN_UPSTREAM` or `BFF_OAUTH_UPSTREAM` is not an absolute URL.

### Migration-only pass-through

Without `BFF_CLIENT_ID` the BFF refuses to start, because it would otherwise be an
unauthenticated pass-through to the admin API. `BFF_PHASE1_PASSTHROUGH=true` overrides that for a
migration from a browser-held-token deployment: every `/api/admin/*` request is then forwarded
with whatever `Authorization` header the browser sends, with no session and no CSRF check. It
exists only for such a migration window; never use it in production or to run locally.

## Run

You need a Socrate server and a confidential OAuth client registered in it, whose redirect URI is
`BFF_PUBLIC_ORIGIN` + `/bff/callback`.

### Locally, with the Vite dev server

```bash
cd bff
export BFF_CLIENT_ID=<your client id>
export BFF_CLIENT_SECRET=<your client secret>
export BFF_OAUTH_PUBLIC_URL=http://localhost:8080
export BFF_PUBLIC_ORIGIN=http://localhost:5180     # the Vite dev server, which proxies /bff
export BFF_COOKIE_SECURE=false
go run .                                           # listens on 127.0.0.1:8090
```

Register `http://localhost:5180/bff/callback` as the client's redirect URI, then run
`npm run dev` from the repository root in a second terminal.

### In a container

```bash
docker build -t socrate-monitoring-bff .
docker run --rm --network host --env-file /path/to/bff.env socrate-monitoring-bff
```

`/path/to/bff.env` holds the variables above, outside the repository. `--network host` (Linux)
lets the container reach the loopback-only admin API and bind `127.0.0.1:8090` on the host with
the defaults. Without it, `127.0.0.1` inside the container is the container itself: set
`BFF_LISTEN_ADDR=0.0.0.0:8090`, publish the port (`-p 127.0.0.1:8090:8090`) and point
`BFF_ADMIN_UPSTREAM` and `BFF_OAUTH_UPSTREAM` at addresses the container can reach.

Wire it into Caddy with [`Caddyfile.example`](Caddyfile.example); the production site is
[`deploy/Caddyfile`](../deploy/Caddyfile).

### Tests

```bash
go vet ./... && go test -race ./...
golangci-lint run ./...
```

## Routes

| Route | Behaviour |
|-------|-----------|
| `GET /bff/healthz` | Liveness probe. |
| `GET /bff/login` | Starts Authorization Code + PKCE and binds the login to this browser with a short-lived nonce cookie. Per-IP budget. |
| `GET /bff/callback` | Completes only for the browser that started the login; exchanges the code server-side, creates the session and sets the cookie. |
| `GET /bff/session` | `{authenticated, user, csrf}` for the SPA bootstrap (`Cache-Control: no-store`). Slides the idle window with an update-only touch, so it never re-creates a deleted session. |
| `POST /bff/logout` | Revokes the tokens at the issuer, deletes the session and clears the cookie (CSRF-protected). A failed server-side delete answers `500 logout_incomplete` rather than reporting success. |
| `POST /bff/elevate` | Step-up: re-authenticates at Socrate with the session's token and keeps the fresh token in the session (CSRF-protected; nothing reaches the browser). Per-IP budget. |
| `ANY /api/admin/**` | Allowlisted reverse proxy that injects the session's access token; SSE-aware. Unsafe methods need a valid `X-CSRF-Token`. |
| anything else | `404`: the BFF is an allowlist, never an open proxy. |

The SPA is cookie-only: it sends `credentials: 'include'`, never an `Authorization` header,
bootstraps from `/bff/session` and signs in through `/bff/login`.

## Security notes

- **Dependencies**: the `backendkit/bff` gateway and `pgx` (for the optional Postgres store),
  nothing else.
- **Allowlist, not an open proxy**: only `/bff/*` and `/api/admin/*` are served. Requests whose
  path is not already canonical (`..`, `.`, `//`, or percent-encoded dot-segments such as
  `%2e%2e`) are refused outright, so the allowlist decision and the upstream's routing decision
  are always made on the same string.
- **Client IP for the per-IP budgets**: `X-Forwarded-For` is honoured only when the TCP peer is
  loopback (Caddy on the same host, which replaces any client-supplied value); from any other peer
  it is ignored.
- **Step-up errors**: `/bff/elevate` forwards the admin API's `4xx` challenge so the step-up
  dialog can prompt again, never an upstream `5xx` body, and treats a `200` without a usable
  `access_token` and `expires_in` as a failure.
- **Tokens at rest**: with `BFF_SESSION_DSN` set, each session row's `data` column holds the
  OAuth access **and refresh token in plaintext**. Anyone who can read the table, or a dump of
  it, holds every active operator's session. In place: the BFF uses its own Postgres role and
  database; `deploy/scripts/backup-db.sh` excludes the `bff_sessions` and `bff_login_states`
  rows from dumps; sessions are short-lived and revoked at logout. Envelope encryption of the
  `data` column is the next step if the database is shared or backed up elsewhere.
- **Store failures**: every failed Postgres statement is logged, and the store fails closed (a
  read error means "no session").
- **Not yet**: the BFF to Socrate leg is not sender-constrained (DPoP, RFC 9449).
