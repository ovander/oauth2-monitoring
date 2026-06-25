# Socrate — Production Deployment (single VPS)

Reference architecture and operational runbook for the `vandermoten.eu`
deployment: one Linux VPS running **Caddy + Postgres + Socrate + two SPAs + the
monitoring BFF**.

## Architecture

```
                          Internet (443 only)
                                │
                          ┌─────▼──────┐   Caddy — the ONLY public listener
                          │   Caddy    │   (TLS, static SPA serving, routing)
                          └──┬───┬───┬─┘
        socrate.…           │   │   │            monitoring.…
        ┌───────────────────┘   │   └───────────────────┐
        │                  admin.…                       │
        ▼                       ▼                        ▼
  127.0.0.1:8080         /srv/admin/dist          /srv/monitoring/dist (SPA)
  Socrate OAuth          (admin SPA)              + @bff /bff/* /api/admin/*
  (public OIDC)          + @adminapi → :8081             │
        │                       │                        ▼
        │                       │                 127.0.0.1:8090  monitoring BFF
        │                       │                        │
        │                       └──────────┬─────────────┘
        ▼                                  ▼
   127.0.0.1:5432  Postgres        127.0.0.1:8081  Socrate admin API (LOOPBACK)
                                   ── Tier-0 control plane, no public subdomain ──
```

**Key properties**
- Caddy is the only thing listening on the public interface. Everything else
  binds `127.0.0.1`.
- The **admin API (`:8081`) is loopback-only** (`ADMIN_BIND_HOST=127.0.0.1`) — off
  the public internet entirely. The monitoring **BFF** is its client; the admin
  SPA reaches it through Caddy on-box (until it gets its own BFF).
- The monitoring SPA holds no tokens once BFF Phase 2 lands; today (Phase 1) the
  BFF is a transparent proxy.
- Build toolchains (Node/Go) stay **off the VPS** — we ship built artifacts only.

## Components & ports

| Service | Bind | Public host | Unit / source |
|---------|------|-------------|---------------|
| Caddy | `:80`, `:443` | all three subdomains | system package |
| Socrate OAuth | `127.0.0.1:8080` | `socrate.vandermoten.eu` | `socrate.service` (go-oauth2) |
| Socrate admin API | `127.0.0.1:8081` | — (internal) | same binary, `ADMIN_PORT` |
| Monitoring BFF | `127.0.0.1:8090` | via `monitoring.…` | `socrate-monitoring-bff.service` |
| Monitoring SPA | static | `monitoring.vandermoten.eu` | `/srv/monitoring/dist` |
| Admin SPA | static | `admin.vandermoten.eu` | `/srv/admin/dist` (separate repo) |
| Postgres | `127.0.0.1:5432` | — | system package |

## Files in this directory

| Path | Purpose |
|------|---------|
| `Caddyfile` | Production Caddy site for the three subdomains |
| `systemd/socrate.service` | Hardened unit for the Socrate backend |
| `systemd/socrate-monitoring-bff.service` | Hardened unit for the BFF |
| `env/socrate.env.example` | Socrate env template |
| `env/bff.env.example` | BFF env template |
| `scripts/bootstrap.sh` | One-time VPS prep (user, dirs, units, Caddy site) |
| `scripts/build.sh` | Build SPA + binaries locally → `deploy/_artifacts/` |
| `scripts/push.sh` | Build, rsync artifacts to the VPS, install + restart |
| `scripts/install-remote.sh` | Runs on the VPS: install, restart, health-check, rollback |

## First-time setup (on the VPS)

```bash
# Prereqs already installed: caddy, postgresql.
git clone https://github.com/ovander/oauth2-monitoring
sudo bash oauth2-monitoring/deploy/scripts/bootstrap.sh

# Fill secrets:
sudo vi /etc/socrate/socrate.env     # DATABASE_URL, SECRET_KEY_BASE, issuer…
sudo vi /etc/socrate/bff.env

# Create DB + run migrations once:
sudo -u postgres createuser socrate; sudo -u postgres createdb -O socrate socrate
#   set AUTO_MIGRATE=true, start socrate once, then set it back to false.
```

## Deploy (from your workstation)

```bash
# Requires the go-oauth2 checkout next to this repo (or set GO_OAUTH2_DIR).
VPS_HOST=deploy@vps.vandermoten.eu ./deploy/scripts/push.sh
```

`push.sh` builds everything locally, rsyncs `deploy/_artifacts/` to the VPS, and
runs `install-remote.sh`, which backs up the current binaries, installs the new
ones + SPA, validates the Caddy config, restarts the services, and
**health-checks** `:8081/health`, `:8090/bff/healthz`, `:8080/health` — rolling
the binaries back automatically if any check fails.

Enable services on first deploy:
```bash
sudo systemctl enable --now socrate socrate-monitoring-bff
sudo systemctl reload caddy
```

## Rollback

`install-remote.sh` keeps the previous binaries under
`/var/backups/socrate/<timestamp>/`. To roll back manually:
```bash
sudo install -m0755 /var/backups/socrate/<ts>/socrate /usr/local/bin/socrate
sudo install -m0755 /var/backups/socrate/<ts>/socrate-monitoring-bff /usr/local/bin/
sudo systemctl restart socrate socrate-monitoring-bff
```

## Security notes

- **No public admin plane:** `:8081` is loopback; the only public surface is
  Caddy on 443 across three subdomains.
- **Least-privileged services:** the systemd units run as a no-login `socrate`
  user with `ProtectSystem=strict`, `NoNewPrivileges`, dropped capabilities,
  and a syscall allowlist.
- **Secrets** live only in `/etc/socrate/*.env` (`0640`, owner `root:socrate`),
  never in the repo or the SPA bundle.
- **Distroless option:** both Go services also ship Dockerfiles if you prefer
  containers; this kit targets native systemd for a single VPS.
- **Follow-up:** give the **admin SPA its own BFF** so it too stops holding
  tokens in the browser (it currently calls the loopback admin API via Caddy).
