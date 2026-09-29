# Socrate production deployment (single host)

Reference architecture and runbook for running the Socrate suite on one Linux host: **Caddy,
Postgres, Socrate, the monitoring console and its BFF**, with the admin console added by its own
kit. The examples use `socrate.example.com`, `admin.example.com` and `monitor.example.com`.

The kit's configuration files carry the owner's host names. Replace them with yours before the
first deploy:

- `deploy/Caddyfile`: the site addresses and the ACME `email` in the global block.
- `deploy/env/socrate.env.example`: `OAUTH_ISSUER` and `ALLOWED_ORIGINS`.
- `deploy/env/bff.env.example`: `BFF_OAUTH_PUBLIC_URL` and `BFF_PUBLIC_ORIGIN`.

## Architecture

```
                          Internet (443 only)
                                │
                          ┌─────▼──────┐   Caddy: the ONLY public listener
                          │   Caddy    │   (TLS, static SPA serving, routing)
                          └──┬───┬───┬─┘
        socrate.…           │   │   │            monitor.…
        ┌───────────────────┘   │   └───────────────────┐
        │                  admin.…                       │
        ▼                       ▼                        ▼
  127.0.0.1:8080         admin SPA + admin BFF    /srv/monitoring/dist (SPA)
  Socrate OAuth          (oauth2-admin kit,       + @bff /bff/* /api/admin/*
                                                         /api/version
  (public OIDC)          /etc/caddy/sites/)              │
        │                       │                        ▼
        │                       │                 127.0.0.1:8090  monitoring BFF
        │                       │                        │
        │                       └──────────┬─────────────┘
        ▼                                  ▼
   127.0.0.1:5432  Postgres        127.0.0.1:8081  Socrate admin API (LOOPBACK)
                                   ── control plane, no public host name ──
```

**Key properties**

- Caddy is the only process listening on the public interface. Everything else binds
  `127.0.0.1`.
- The **admin API (`:8081`) is loopback-only** (`ADMIN_BIND_HOST=127.0.0.1`), off the public
  internet entirely. Its only clients are the two console BFFs (monitoring here, admin from the
  `oauth2-admin` kit), over loopback.
- The monitoring SPA holds no tokens: the BFF owns the OAuth session and injects the bearer on the
  proxy. The BFF refuses to start without a registered client (`BFF_CLIENT_ID`).
- Build toolchains (Node, Go) stay **off the host**: only built artifacts are shipped.

## Components and ports

| Service | Bind | Public host | Unit / source |
|---------|------|-------------|---------------|
| Caddy | `:80`, `:443` | all three host names | system package |
| Socrate OAuth | `127.0.0.1:8080` | `socrate.example.com` | `socrate.service` (Socrate server) |
| Socrate admin API | `127.0.0.1:8081` | none (internal) | same binary, `ADMIN_PORT` |
| Monitoring BFF | `127.0.0.1:8090` | via `monitor.example.com` | `socrate-monitoring-bff.service` |
| Monitoring SPA | static | `monitor.example.com` | `/srv/monitoring/dist` |
| Admin SPA and BFF | static, `127.0.0.1:8091` | `admin.example.com` | `oauth2-admin` kit |
| Postgres | `127.0.0.1:5432` | none | system package |

## Files in this directory

| Path | Purpose |
|------|---------|
| `Caddyfile` | Production Caddy config: Socrate and the monitoring console; imports `/etc/caddy/sites/*.caddy` for the others |
| `systemd/socrate.service` | Hardened unit for the Socrate server |
| `systemd/socrate-monitoring-bff.service` | Hardened unit for the BFF |
| `env/socrate.env.example` | Socrate environment template |
| `env/bff.env.example` | BFF environment template |
| `scripts/bootstrap.sh` | One-time host preparation (users, directories, units, Caddy config, env stubs) |
| `scripts/build.sh` | Builds the SPA and the `socrate`, `socrate-seed` and BFF binaries locally into `deploy/_artifacts/` |
| `scripts/push.sh` | Builds, copies the artifacts to the host with rsync, installs and restarts |
| `scripts/install-remote.sh` | Runs on the host: install, restart, health checks, rollback |
| `scripts/backup-db.sh` | Postgres dump to `/var/backups/socrate` (cron or systemd timer) |

## Prerequisites (before you touch the host)

1. **DNS**: three `A`/`AAAA` records pointing at the host. Caddy's automatic HTTPS will not
   issue certificates until they resolve publicly:
   ```
   socrate.example.com   A   <host-ip>
   admin.example.com     A   <host-ip>
   monitor.example.com   A   <host-ip>
   ```
2. **Firewall**: only SSH, HTTP and HTTPS inbound; everything else stays on loopback:
   ```bash
   sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
   sudo ufw enable
   ```
   Port 80 is needed for the ACME HTTP challenge and the HTTPS redirect.
3. **Packages**: `caddy` and `postgresql` installed.
4. **Secrets**: generate strong values up front; never reuse or commit them:
   ```bash
   openssl rand -hex 32   # SECRET_KEY_BASE (Socrate)
   openssl rand -hex 32   # a database password
   ```
   The BFF's client secret is issued by Socrate when you register the client (below).

## First-time setup (on the host)

```bash
git clone https://github.com/ovander/oauth2-monitoring
sudo bash oauth2-monitoring/deploy/scripts/bootstrap.sh   # users, dirs, units, Caddy, env stubs

# Fill in the secrets. bootstrap.sh set the permissions: socrate.env 0640 root:socrate,
# bff.env 0640 root:socrate-mon-bff; each service reads only its own file.
sudo vi /etc/socrate/socrate.env     # DATABASE_URL, SECRET_KEY_BASE, OAUTH_ISSUER, KEYS_PATH
sudo vi /etc/socrate/bff.env

# Postgres role and database:
sudo -u postgres createuser socrate
sudo -u postgres createdb -O socrate socrate
sudo -u postgres psql -c "ALTER ROLE socrate WITH PASSWORD 'the-db-password-from-above';"
#   put that password into DATABASE_URL in socrate.env.
# If the BFF's durable session store is used, give it its OWN role and database, so the BFF
# cannot read Socrate's tables (users, clients, audit log):
sudo -u postgres createuser socrate_bff
sudo -u postgres createdb -O socrate_bff socrate_bff
sudo -u postgres psql -c "ALTER ROLE socrate_bff WITH PASSWORD 'another-password';"
#   → BFF_SESSION_DSN in bff.env

# Schema migration, once:
#   set AUTO_MIGRATE=true in socrate.env, start socrate, confirm it is up, set it back to false.
```

### Signing keys

Socrate signs all tokens with on-disk RSA keys. `KEYS_PATH` **must be absolute in production**
(the server refuses to start otherwise) and the directory must be writable for rotation
(`socrate.service` grants exactly `/var/lib/socrate/keys`). Generate them locally, in a checkout
of the Socrate server (`ovander/go-oauth2`, not public yet), and copy them in:

```bash
cd go-oauth2 && make gen-keys                       # → keys/{private.pem,public.pem,key_id}
sudo cp -r keys/. /var/lib/socrate/keys/
sudo chown -R socrate:socrate /var/lib/socrate/keys
sudo chmod 0700 /var/lib/socrate/keys
```

### First superadmin

The admin console only admits superadmins, so create the first one with the shipped
`socrate-seed` CLI (cross-built by `build.sh`, installed to `/usr/local/bin` by `push.sh`). It
reads the same environment, so run it as `socrate` with `socrate.env` loaded:

```bash
sudo -u socrate bash -c 'set -a; . /etc/socrate/socrate.env; set +a; \
  /usr/local/bin/socrate-seed -email you@example.com -name "Your Name"'
# Prints a generated one-time password (or pass -password). The account is
# flagged MustChangePassword: change it at first login.
```

### Register the OAuth client

Sign in to `https://admin.example.com` as that superadmin and register a **confidential** OAuth
client for the monitoring BFF, with the redirect URI `https://monitor.example.com/bff/callback`.
Copy the issued `client_id` and `client_secret` into `/etc/socrate/bff.env` (`BFF_CLIENT_ID`,
`BFF_CLIENT_SECRET`) and restart the BFF. The BFF does not start without them.

## Deploy (from your workstation)

`push.sh` builds everything locally, including the Socrate binaries, so it needs a checkout of
the Socrate server (`ovander/go-oauth2`) next to this repository, or its path in
`GO_OAUTH2_DIR`. Without that checkout the Socrate binaries are skipped with a warning.

```bash
VPS_HOST=deploy@host.example.com ./deploy/scripts/push.sh
```

`push.sh` runs `build.sh`, copies `deploy/_artifacts/` to the host with rsync and runs
`install-remote.sh`, which backs up the current binaries, installs the new ones and the SPA,
validates the Caddy config, restarts the services and **health-checks** `:8081/health`,
`:8090/bff/healthz` and `:8080/health`, rolling the binaries back automatically if a check fails.

Other settings: `VPS_PORT` (SSH port, default 22) and `SKIP_BUILD=1` (reuse the existing
`deploy/_artifacts/`). `TARGET_OS` and `TARGET_ARCH` (default `linux`/`amd64`) select the
platform of the binaries.

### Tag-pinned deploys

By default each component is built from its current working tree, uncommitted changes included.
For a release, pin both to a git ref instead:

- `REF`, or the first argument, is the tag, branch or commit of **this** repository.
- `SOCRATE_REF` is the ref of the Socrate server checkout.

Each ref is built from a throwaway `git worktree`, so the release is exactly the committed source,
and the Socrate binaries are stamped with that version (the build fails if the stamp is missing).
The shipped Socrate version is written to `deploy/_artifacts/SOCRATE_VERSION`.

```bash
git fetch --tags && git -C ../go-oauth2 fetch --tags
VPS_HOST=deploy@host.example.com SOCRATE_REF=v1.5.1 ./deploy/scripts/push.sh v1.0.1

# Build only, without shipping:
SOCRATE_REF=v1.5.1 ./deploy/scripts/build.sh v1.0.1
```

Enable the services on the first deploy:

```bash
sudo systemctl enable --now socrate socrate-monitoring-bff
sudo systemctl reload caddy
```

## Rollback

`install-remote.sh` keeps the previous binaries under `/var/backups/socrate/<timestamp>/`. To roll
back by hand:

```bash
sudo install -m0755 /var/backups/socrate/<ts>/socrate /usr/local/bin/socrate
sudo install -m0755 /var/backups/socrate/<ts>/socrate-monitoring-bff /usr/local/bin/
sudo systemctl restart socrate socrate-monitoring-bff
```

To roll back to a release, redeploy its tag with `REF` and `SOCRATE_REF`.

## Backups and restore

The whole authorisation state (users, OAuth clients, tokens, audit log) lives in Postgres, so a
database dump is your disaster-recovery anchor. The signing keys in `/var/lib/socrate/keys` are
the other must-back-up item: lose them and every issued token becomes unverifiable.

```bash
# Manual dump (keeps the newest 14 by default):
sudo -u postgres bash oauth2-monitoring/deploy/scripts/backup-db.sh
# The dump excludes the rows of bff_sessions and bff_login_states: with BFF_SESSION_DSN set
# they hold live OAuth tokens in plaintext, which must never end up in a backup file.
# Operators simply sign in again after a restore.

# Schedule it: /etc/cron.d/socrate-backup
30 3 * * *  postgres  /usr/local/bin/socrate-backup-db.sh >> /var/log/socrate-backup.log 2>&1

# Restore a dump:
gunzip -c /var/backups/socrate/socrate-YYYYmmdd-HHMMSS.sql.gz | sudo -u postgres psql socrate

# Back up the signing keys too (offline, encrypted):
sudo tar czf socrate-keys.tgz -C /var/lib/socrate keys
```

> Copy `backup-db.sh` to `/usr/local/bin/socrate-backup-db.sh` if you reference it from cron, or
> run it in place from the repository.

## Smoke test (after every deploy)

The health checks prove the processes are up; this proves authentication works.

```bash
# 1. Discovery and JWKS are served and the issuer matches the host name:
curl -fsS https://socrate.example.com/.well-known/openid-configuration | jq .issuer
curl -fsS https://socrate.example.com/.well-known/jwks.json | jq '.keys | length'

# 2. The admin API is NOT reachable from the public internet (must fail or be refused):
curl -fsS --max-time 5 https://admin.example.com/api/admin/apps && echo "LEAK!" || echo "ok: not public"
curl -fsS --max-time 5 http://<host-ip>:8081/health && echo "LEAK!" || echo "ok: loopback only"

# 3. Browser: sign in to https://admin.example.com as the superadmin, then load
#    https://monitor.example.com and confirm the dashboard renders with data.
```

A green run means the OIDC metadata is correct, the admin plane is private and sign-in works end
to end.

## Deploy-day checklist

Top to bottom, the first time:

- [ ] DNS records for all three host names resolve to the host.
- [ ] `ufw` allows only 22/80/443; `ufw status` confirms.
- [ ] `caddy` and `postgresql` installed and running.
- [ ] Host names and ACME email replaced in `deploy/Caddyfile` and the env templates.
- [ ] `bootstrap.sh` run; `/etc/socrate`, `/var/lib/socrate/keys` and `/srv/{monitoring,admin}/dist` exist.
- [ ] `socrate.env` and `bff.env` filled (real `SECRET_KEY_BASE`, `DATABASE_URL`, `OAUTH_ISSUER`, `KEYS_PATH`); `socrate.env` is `0640 root:socrate`, `bff.env` is `0640 root:socrate-mon-bff`.
- [ ] Postgres role and database created; password set and matching `DATABASE_URL`.
- [ ] Signing keys generated and copied to `/var/lib/socrate/keys` (`0700`, owner `socrate`).
- [ ] Schema migrated once (`AUTO_MIGRATE=true`, start, back to `false`).
- [ ] `push.sh` deployed the binaries and the SPA; the `install-remote.sh` health checks passed.
- [ ] First superadmin created with `socrate-seed`; password changed at first login.
- [ ] BFF client registered in the admin console; `BFF_CLIENT_ID` and `BFF_CLIENT_SECRET` in `bff.env`.
- [ ] `systemctl enable --now socrate socrate-monitoring-bff`; `systemctl reload caddy`.
- [ ] Smoke test (above) green: OIDC metadata, admin plane private, sign-in works.
- [ ] `backup-db.sh` scheduled; signing keys backed up offline.

## Security notes

- **No public admin plane**: `:8081` is loopback; the only public surface is Caddy on 443 across
  three host names.
- **Least-privileged services**: the systemd units run as no-login users with
  `ProtectSystem=strict`, `NoNewPrivileges`, dropped capabilities and a syscall allowlist.
  **One user per service**: `socrate` owns the signing keys and its environment; the monitoring
  BFF runs as `socrate-mon-bff` (the admin BFF as `socrate-admin-bff`, from its own kit) and
  additionally masks `/var/lib/socrate` and the other services' env files with
  `InaccessiblePaths`, so a compromised BFF cannot reach the private key, `SECRET_KEY_BASE` or
  Socrate's database credentials.
- **Secrets** live only in `/etc/socrate/*.env` (`0640`, owner `root:<that service's user>`),
  never in the repository or the SPA bundle.
- **Containers**: both Go services also ship Dockerfiles if you prefer them; this kit targets
  native systemd on a single host.
- **Admin console**: has its own BFF (`oauth2-admin/deploy/`), which installs its Caddy site file
  under `/etc/caddy/sites/`. The Caddyfile here ends with `import /etc/caddy/sites/*.caddy` and
  routes no public host to the admin API directly.
- **Suite-level runbook** (several applications on one host): `docs/DEPLOYMENT-VPS-MULTI-APP.md`
  in the Socrate server repository (`ovander/go-oauth2`, not public yet).
