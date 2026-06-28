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
| `scripts/build.sh` | Build SPA + `socrate` / `socrate-seed` / BFF binaries locally → `deploy/_artifacts/` |
| `scripts/push.sh` | Build, rsync artifacts to the VPS, install + restart |
| `scripts/install-remote.sh` | Runs on the VPS: install, restart, health-check, rollback |
| `scripts/backup-db.sh` | Postgres dump → `/var/backups/socrate` (cron/systemd-timer friendly) |

## Prerequisites (before you touch the VPS)

1. **DNS** — three `A`/`AAAA` records pointing at the VPS IP. Caddy's automatic
   HTTPS will not issue certificates until these resolve publicly:
   ```
   socrate.vandermoten.eu      A   <vps-ip>
   admin.vandermoten.eu        A   <vps-ip>
   monitoring.vandermoten.eu   A   <vps-ip>
   ```
2. **Firewall** — only SSH + HTTP/HTTPS inbound; everything else stays loopback:
   ```bash
   sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
   sudo ufw enable
   ```
   (80 is required for the ACME HTTP challenge / HTTPS redirect.)
3. **Packages** — `caddy` and `postgresql` installed.
4. **Secrets** — generate strong values up front; never reuse or commit them:
   ```bash
   openssl rand -hex 32   # SECRET_KEY_BASE (Socrate)
   openssl rand -hex 32   # a DB password
   openssl rand -hex 32   # BFF_CLIENT_SECRET (Phase 2, once the BFF client exists)
   ```

## First-time setup (on the VPS)

```bash
git clone https://github.com/ovander/oauth2-monitoring
sudo bash oauth2-monitoring/deploy/scripts/bootstrap.sh   # users, dirs, units, Caddy, env stubs

# Fill secrets (0640, root:socrate — bootstrap already set perms):
sudo vi /etc/socrate/socrate.env     # DATABASE_URL, SECRET_KEY_BASE, OAUTH_ISSUER, KEYS_PATH
sudo vi /etc/socrate/bff.env

# Postgres role + database:
sudo -u postgres createuser socrate
sudo -u postgres createdb -O socrate socrate
sudo -u postgres psql -c "ALTER ROLE socrate WITH PASSWORD 'the-db-password-from-above';"
#   put that password into DATABASE_URL in socrate.env (and bff.env if BFF_SESSION_DSN is used).

# Schema migration, once:
#   set AUTO_MIGRATE=true in socrate.env, start socrate, confirm it's up, set it back to false.
```

### Signing keys

Socrate signs all tokens with on-disk RSA keys. `KEYS_PATH` **must be absolute in
production** (the server refuses to start otherwise) and the directory must be
writable for rotation (`socrate.service` grants exactly `/var/lib/socrate/keys`).
Generate them locally and copy them in:

```bash
cd go-oauth2 && make gen-keys                       # → keys/{private.pem,public.pem,key_id}
sudo cp -r keys/. /var/lib/socrate/keys/
sudo chown -R socrate:socrate /var/lib/socrate/keys
sudo chmod 0700 /var/lib/socrate/keys
```

### First superadmin

The admin console only admits superadmins, so create the first one with the
shipped `socrate-seed` CLI (cross-built by `build.sh`, installed to
`/usr/local/bin` by `push.sh`). It reads the same env, so run it as `socrate`
with `socrate.env` loaded:

```bash
sudo -u socrate bash -c 'set -a; . /etc/socrate/socrate.env; set +a; \
  /usr/local/bin/socrate-seed -email you@vandermoten.eu -name "Your Name"'
# Prints a generated one-time password (or pass -password). The account is
# flagged MustChangePassword — change it at first login.
```

### Register the OAuth clients

Log into `https://admin.vandermoten.eu` as that superadmin and register a
**confidential** OAuth client for each console that needs one (e.g. the
monitoring BFF for Phase 2). Copy the issued `client_id` / `client_secret` into
`/etc/socrate/bff.env` (`BFF_CLIENT_ID` / `BFF_CLIENT_SECRET`) and restart the
BFF. Phase-1 BFF is a transparent proxy and needs no client; it becomes required
when you turn on server-side token custody.

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

## Backups & restore

The entire authorization state — users, OAuth clients, tokens, audit log — lives
in Postgres, so a database dump is your disaster-recovery anchor. The signing
keys in `/var/lib/socrate/keys` are the other must-back-up item (lose them and
every issued token becomes unverifiable).

```bash
# Manual dump (keeps the newest 14 by default):
sudo -u postgres bash oauth2-monitoring/deploy/scripts/backup-db.sh

# Schedule it — /etc/cron.d/socrate-backup:
30 3 * * *  postgres  /usr/local/bin/socrate-backup-db.sh >> /var/log/socrate-backup.log 2>&1

# Restore a dump:
gunzip -c /var/backups/socrate/socrate-YYYYmmdd-HHMMSS.sql.gz | sudo -u postgres psql socrate

# Back up the signing keys too (offline, encrypted):
sudo tar czf socrate-keys.tgz -C /var/lib/socrate keys
```

> Copy `backup-db.sh` to `/usr/local/bin/socrate-backup-db.sh` if you reference
> it from cron, or run it in place from the repo.

## Smoke test (after every deploy)

Health checks prove the processes are up; this proves auth actually works.

```bash
# 1. Discovery + JWKS are served and the issuer matches the subdomain:
curl -fsS https://socrate.vandermoten.eu/.well-known/openid-configuration | jq .issuer
curl -fsS https://socrate.vandermoten.eu/.well-known/jwks.json | jq '.keys | length'

# 2. The admin API is NOT reachable from the public internet (must fail/refuse):
curl -fsS --max-time 5 https://admin.vandermoten.eu/api/admin/apps && echo "LEAK!" || echo "ok: not public"
curl -fsS --max-time 5 http://<vps-ip>:8081/health && echo "LEAK!" || echo "ok: loopback only"

# 3. Browser: log into https://admin.vandermoten.eu as the superadmin, then load
#    https://monitoring.vandermoten.eu and confirm the dashboard renders with data.
```

A green run = OIDC metadata correct, admin plane private, and an end-to-end login
working.

## Deploy-day checklist

Top to bottom, the first time:

- [ ] DNS A records for all three subdomains resolve to the VPS.
- [ ] `ufw` allows only 22/80/443; `ufw status` confirms.
- [ ] `caddy` + `postgresql` installed and running.
- [ ] `bootstrap.sh` run; `/etc/socrate`, `/var/lib/socrate/keys`, `/srv/{monitoring,admin}/dist` exist.
- [ ] `socrate.env` + `bff.env` filled (real `SECRET_KEY_BASE`, `DATABASE_URL`, `OAUTH_ISSUER`, `KEYS_PATH`); files `0640 root:socrate`.
- [ ] Postgres role + DB created; password set and matches `DATABASE_URL`.
- [ ] Signing keys generated and copied to `/var/lib/socrate/keys` (`0700`, owner `socrate`).
- [ ] Schema migrated once (`AUTO_MIGRATE=true` → start → back to `false`).
- [ ] `push.sh` deployed binaries + SPA; `install-remote.sh` health checks passed.
- [ ] First superadmin created via `socrate-seed`; password changed at first login.
- [ ] OAuth client(s) registered in the admin console; `bff.env` updated if Phase 2.
- [ ] `systemctl enable --now socrate socrate-monitoring-bff`; `systemctl reload caddy`.
- [ ] Smoke test (above) green: OIDC metadata, admin plane private, login works.
- [ ] `backup-db.sh` scheduled; signing keys backed up offline.

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
