#!/usr/bin/env bash
# build.sh — build all deployable artifacts LOCALLY into deploy/_artifacts/.
#
# Keeps the build toolchain (Node, Go) OFF the Tier-0 VPS: we ship only the
# built SPA and static binaries. Run from anywhere; paths resolve from the repo.
#
# Env overrides:
#   GO_OAUTH2_DIR   path to the go-oauth2 checkout (default: ../go-oauth2)
#   TARGET_OS       GOOS for the binaries (default: linux)
#   TARGET_ARCH     GOARCH for the binaries (default: amd64)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mon_repo="$(cd "$here/../.." && pwd)"
go_oauth2_dir="${GO_OAUTH2_DIR:-$(cd "$mon_repo/.." && pwd)/go-oauth2}"
out="$mon_repo/deploy/_artifacts"
target_os="${TARGET_OS:-linux}"
target_arch="${TARGET_ARCH:-amd64}"

echo "▶ build: monitoring repo = $mon_repo"
echo "▶ build: go-oauth2 dir    = $go_oauth2_dir"
echo "▶ build: target           = ${target_os}/${target_arch}"

rm -rf "$out"
mkdir -p "$out/bin" "$out/monitoring"

# 1) Monitoring SPA (static — platform independent).
echo "▶ building monitoring SPA…"
( cd "$mon_repo" && npm ci && npm run build )
cp -r "$mon_repo/dist/." "$out/monitoring/dist/"

# 2) Monitoring BFF binary.
echo "▶ building monitoring BFF…"
( cd "$mon_repo/bff" && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
    go build -trimpath -ldflags="-s -w" -o "$out/bin/socrate-monitoring-bff" . )

# 3) Socrate backend + seed binaries (optional — only if the go-oauth2 checkout
#    is present). The seed binary creates the first superadmin on the VPS, which
#    has no Go toolchain, so it must be cross-built and shipped here.
if [ -d "$go_oauth2_dir" ]; then
  echo "▶ building Socrate backend…"
  ( cd "$go_oauth2_dir" && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
      go build -trimpath -ldflags="-s -w" -o "$out/bin/socrate" ./cmd/server )
  echo "▶ building Socrate seed (first-superadmin)…"
  ( cd "$go_oauth2_dir" && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
      go build -trimpath -ldflags="-s -w" -o "$out/bin/socrate-seed" ./cmd/seed )
else
  echo "⚠ go-oauth2 not found at $go_oauth2_dir — skipping Socrate binaries (set GO_OAUTH2_DIR)"
fi

echo "✔ artifacts in $out"
find "$out" -maxdepth 2 -type f | sed "s|$out/|  |"
