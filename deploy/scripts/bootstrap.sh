#!/usr/bin/env bash
# bootstrap.sh — one-time VPS preparation (run as root). Idempotent.
# Creates the service user + directories, installs the systemd units and the
# Caddy site, and seeds env files (which you then fill with secrets).
#
#   sudo bash bootstrap.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd "$here/.." && pwd)"

echo "▶ creating service user 'socrate' (no login)…"
id -u socrate >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin socrate

echo "▶ creating directories…"
install -d -o socrate -g socrate /srv/monitoring/dist /srv/admin/dist
install -d -o root    -g root    /etc/socrate
install -d -o root    -g root    /var/backups/socrate
# Socrate signing keys (writable for rotation, KEYS_PATH) + optional GeoIP data.
install -d -o socrate -g socrate -m 0700 /var/lib/socrate /var/lib/socrate/keys
install -d -o socrate -g socrate -m 0750 /var/lib/socrate/data

echo "▶ installing systemd units…"
cp "$deploy_dir/systemd/socrate.service"                 /etc/systemd/system/
cp "$deploy_dir/systemd/socrate-monitoring-bff.service"  /etc/systemd/system/
systemctl daemon-reload

echo "▶ seeding env files (fill in secrets, then chmod 600)…"
for f in socrate bff; do
  if [ ! -f "/etc/socrate/$f.env" ]; then
    cp "$deploy_dir/env/$f.env.example" "/etc/socrate/$f.env"
    chown root:socrate "/etc/socrate/$f.env"
    chmod 0640 "/etc/socrate/$f.env"
    echo "  · /etc/socrate/$f.env created — EDIT IT (secrets)"
  else
    echo "  · /etc/socrate/$f.env exists — left untouched"
  fi
done

echo "▶ installing Caddy site…"
if [ -d /etc/caddy ]; then
  cp "$deploy_dir/Caddyfile" /etc/caddy/Caddyfile
  echo "  · /etc/caddy/Caddyfile installed — review domains/email"
else
  echo "  ⚠ /etc/caddy not found — install Caddy first, then copy deploy/Caddyfile"
fi

cat <<'EOF'

Next:
  1. Edit /etc/socrate/socrate.env and /etc/socrate/bff.env (secrets, DB URL, KEYS_PATH).
  2. Create the Postgres DB/user; run the go-oauth2 migration once (AUTO_MIGRATE=true, then back to false).
  3. Generate RSA signing keys into /var/lib/socrate/keys (see README "Signing keys").
  4. Deploy binaries + SPA:  ./deploy/scripts/push.sh   (from your workstation)
  5. Create the first superadmin: run socrate-seed once on the VPS (see README "First superadmin").
  6. Enable services:        systemctl enable --now socrate socrate-monitoring-bff
  7. Reload Caddy:           systemctl reload caddy

See deploy/README.md for the full deploy-day checklist, OAuth client registration,
Postgres backup/restore, and the login smoke test.
EOF
