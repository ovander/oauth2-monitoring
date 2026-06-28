#!/usr/bin/env bash
# install-remote.sh — runs ON the VPS (as root, invoked by push.sh).
# Installs staged artifacts, restarts services, health-checks, and rolls back
# the binaries if the health check fails.
#
#   sudo install-remote.sh <artifacts-dir>
set -euo pipefail

artifacts="${1:?usage: install-remote.sh <artifacts-dir>}"
bin_dir="/usr/local/bin"
web_mon="/srv/monitoring/dist"
backup="/var/backups/socrate/$(date +%Y%m%d-%H%M%S)"

echo "▶ install: artifacts = $artifacts"
mkdir -p "$backup" "$web_mon"

install_bin() {           # install_bin <name>
  local name="$1" src="$artifacts/bin/$1"
  [ -f "$src" ] || { echo "  · $name: not in artifacts, skipping"; return; }
  if [ -f "$bin_dir/$name" ]; then cp -a "$bin_dir/$name" "$backup/$name"; fi
  install -m 0755 "$src" "$bin_dir/$name"
  echo "  · $name installed"
}

# 1) Binaries (back up current first for rollback).
install_bin socrate
install_bin socrate-monitoring-bff
# socrate-seed is a one-time CLI (first superadmin), not a service — ship it so
# the toolchain-free VPS can run it, but it has no health check.
install_bin socrate-seed

# 2) Monitoring SPA static (atomic-ish: rsync with --delete).
if [ -d "$artifacts/monitoring/dist" ]; then
  rsync -a --delete "$artifacts/monitoring/dist/" "$web_mon/"
  echo "  · monitoring SPA synced → $web_mon"
fi

# 3) Validate Caddy config (if managed here) and restart services.
if command -v caddy >/dev/null && [ -f /etc/caddy/Caddyfile ]; then
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
fi

echo "▶ restarting services…"
systemctl restart socrate || true
systemctl restart socrate-monitoring-bff || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy || true

# 4) Health checks — roll back binaries on failure.
sleep 2
ok=1
check() { echo -n "  · $1 … "; if curl -fsS --max-time 5 "$2" >/dev/null; then echo ok; else echo FAIL; ok=0; fi; }
check "admin API"  "http://127.0.0.1:8081/health"
check "BFF"        "http://127.0.0.1:8090/bff/healthz"
check "OAuth"      "http://127.0.0.1:8080/health"

if [ "$ok" -ne 1 ]; then
  echo "✖ health check failed — rolling back binaries from $backup"
  for f in "$backup"/*; do [ -e "$f" ] && install -m 0755 "$f" "$bin_dir/$(basename "$f")"; done
  systemctl restart socrate socrate-monitoring-bff || true
  exit 1
fi

echo "✔ install healthy (backup kept at $backup)"
