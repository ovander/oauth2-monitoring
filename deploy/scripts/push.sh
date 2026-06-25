#!/usr/bin/env bash
# push.sh — build locally, ship artifacts to the VPS, install + restart remotely.
#
# Usage:
#   VPS_HOST=deploy@vps.vandermoten.eu ./deploy/scripts/push.sh
#
# Env:
#   VPS_HOST   ssh target (user@host)         [required]
#   VPS_PORT   ssh port                        [default 22]
#   SKIP_BUILD set to 1 to reuse _artifacts/   [default unset]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mon_repo="$(cd "$here/../.." && pwd)"
out="$mon_repo/deploy/_artifacts"

: "${VPS_HOST:?set VPS_HOST=user@host}"
vps_port="${VPS_PORT:-22}"
ssh_opts=(-p "$vps_port")
staging="/tmp/socrate-deploy-$$"

if [ "${SKIP_BUILD:-}" != "1" ]; then
  "$here/build.sh"
fi
[ -d "$out" ] || { echo "✖ no artifacts at $out (run build.sh)"; exit 1; }

echo "▶ staging artifacts + install script on $VPS_HOST:$staging"
ssh "${ssh_opts[@]}" "$VPS_HOST" "mkdir -p '$staging'"

# rsync the built artifacts and the remote installer.
rsync -az -e "ssh -p $vps_port" --delete "$out/" "$VPS_HOST:$staging/artifacts/"
rsync -az -e "ssh -p $vps_port" "$here/install-remote.sh" "$VPS_HOST:$staging/install-remote.sh"

echo "▶ running remote install (sudo) …"
ssh "${ssh_opts[@]}" "$VPS_HOST" "sudo bash '$staging/install-remote.sh' '$staging/artifacts' && rm -rf '$staging'"

echo "✔ deploy complete"
