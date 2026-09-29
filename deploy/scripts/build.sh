#!/usr/bin/env bash
# build.sh — build all deployable artifacts LOCALLY into deploy/_artifacts/.
#
# Keeps the build toolchain (Node, Go) OFF the Tier-0 VPS: we ship only the
# built SPA and static binaries. Run from anywhere; paths resolve from the repo.
#
# Reproducible, tag-pinned builds:
#   By default each component builds from its current working tree (the historic
#   behaviour). Pass a git ref to build that exact committed tree instead, via a
#   throwaway `git worktree` — no dirty local changes leak into a release, and
#   the version is stamped from the ref.
#
#   REF          git ref (tag/branch/commit) for THIS repo, the monitoring
#                console. Also settable as the first positional arg.
#   SOCRATE_REF  git ref for the go-oauth2 backend it also builds.
#   Each defaults to the current working tree when unset.
#
# Env overrides:
#   GO_OAUTH2_DIR   path to the go-oauth2 checkout (default: ../go-oauth2)
#   TARGET_OS       GOOS for the binaries (default: linux)
#   TARGET_ARCH     GOARCH for the binaries (default: amd64)
#
# Examples:
#   ./build.sh                          # working trees (dev)
#   ./build.sh v1.0.0                   # monitoring at v1.0.0, backend working tree
#   SOCRATE_REF=v1.4.0 ./build.sh v1.0.0
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mon_repo="$(cd "$here/../.." && pwd)"
go_oauth2_dir="${GO_OAUTH2_DIR:-$(cd "$mon_repo/.." && pwd)/go-oauth2}"
out="$mon_repo/deploy/_artifacts"
target_os="${TARGET_OS:-linux}"
target_arch="${TARGET_ARCH:-amd64}"
ref="${REF:-${1:-}}"
socrate_ref="${SOCRATE_REF:-}"

# Temporary worktrees to remove on exit.
_worktrees=()
cleanup() {
  for wt in "${_worktrees[@]:-}"; do
    [ -n "$wt" ] || continue
    repo="${wt%%::*}"; path="${wt##*::}"
    git -C "$repo" worktree remove --force "$path" 2>/dev/null || rm -rf "$path"
  done
}
trap cleanup EXIT

# checkout_ref REPO REF -> prints the directory to build from.
# Empty ref: the repo's own working tree. Otherwise a detached worktree of ref.
checkout_ref() {
  local repo="$1" r="$2"
  if [ -z "$r" ]; then
    printf '%s' "$repo"; return
  fi
  if ! git -C "$repo" rev-parse --verify --quiet "${r}^{commit}" >/dev/null; then
    echo "✖ ref '$r' not found in $repo (fetch tags first?)" >&2; exit 1
  fi
  local wt; wt="$(mktemp -d)"
  git -C "$repo" worktree add --quiet --detach "$wt" "$r" >&2
  _worktrees+=("${repo}::${wt}")
  printf '%s' "$wt"
}

# describe REPO REF -> version string stamped into the binary.
describe() {
  local repo="$1" r="$2"
  if [ -n "$r" ]; then printf '%s' "$r"; return; fi
  git -C "$repo" describe --tags --always --dirty 2>/dev/null || echo dev
}

mon_src="$(checkout_ref "$mon_repo" "$ref")"
echo "▶ build: monitoring repo = $mon_repo  (ref: ${ref:-working tree})"
echo "▶ build: go-oauth2 dir    = $go_oauth2_dir  (ref: ${socrate_ref:-working tree})"
echo "▶ build: target           = ${target_os}/${target_arch}"

rm -rf "$out"
mkdir -p "$out/bin" "$out/monitoring"

# 1) Monitoring SPA (static — platform independent). Built from the ref's tree,
#    so its package.json version and assets match the release.
echo "▶ building monitoring SPA…"
( cd "$mon_src" && npm ci && npm run build )
cp -r "$mon_src/dist/." "$out/monitoring/dist/"

# 2) Monitoring BFF binary.
echo "▶ building monitoring BFF…"
( cd "$mon_src/bff" && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
    go build -trimpath -ldflags="-s -w" -o "$out/bin/socrate-monitoring-bff" . )

# 3) Socrate backend + seed binaries (optional — only if the go-oauth2 checkout
#    is present). The seed binary creates the first superadmin on the VPS, which
#    has no Go toolchain, so it must be cross-built and shipped here. The backend
#    version package is stamped so the running server reports its real version in
#    logs, /metrics (socrate_build_info) and the consoles' footer.
if [ -d "$go_oauth2_dir" ]; then
  socrate_src="$(checkout_ref "$go_oauth2_dir" "$socrate_ref")"
  # The -X package path must be the module path of the tree being built: it changed
  # from github.com/ovandermoten/go-oauth2 to github.com/ovander/go-oauth2 in v1.4.0,
  # so read it from that tree's go.mod rather than hard-coding either.
  mod="$(awk '/^module /{print $2; exit}' "$socrate_src/go.mod")"
  [ -n "$mod" ] || { echo "✖ cannot read the module path from $socrate_src/go.mod" >&2; exit 1; }
  ver="$(describe "$go_oauth2_dir" "$socrate_ref")"
  commit="$(git -C "$socrate_src" rev-parse --short HEAD 2>/dev/null || echo none)"
  branch="$(git -C "$socrate_src" rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
  build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  vflags="-s -w \
    -X ${mod}/internal/version.Version=${ver} \
    -X ${mod}/internal/version.Commit=${commit} \
    -X ${mod}/internal/version.BuildTime=${build_time} \
    -X ${mod}/internal/version.Branch=${branch}"
  echo "▶ building Socrate backend… (version: $ver)"
  ( cd "$socrate_src" && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
      go build -trimpath -ldflags="$vflags" -o "$out/bin/socrate" ./cmd/server )
  echo "▶ building Socrate seed (first-superadmin)…"
  ( cd "$socrate_src" && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
      go build -trimpath -ldflags="$vflags" -o "$out/bin/socrate-seed" ./cmd/seed )
  # -X silently ignores a symbol path that does not exist, which would ship a server
  # reporting version=dev. The build time is unique to this run, so its presence in
  # the binary proves the stamp landed.
  if ! grep -aqF -- "$build_time" "$out/bin/socrate"; then
    echo "✖ version stamp missing from the Socrate binary (-X path ${mod}/internal/version)" >&2; exit 1
  fi
  printf '%s\n' "$ver" > "$out/SOCRATE_VERSION"
else
  echo "⚠ go-oauth2 not found at $go_oauth2_dir — skipping Socrate binaries (set GO_OAUTH2_DIR)"
fi

echo "✔ artifacts in $out"
find "$out" -maxdepth 2 -type f | sed "s|$out/|  |"
