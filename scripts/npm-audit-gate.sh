#!/usr/bin/env bash
# npm-audit-gate.sh — CI dependency-advisory gate.
#
# Fails the build when npm reports an advisory at or above $AUDIT_LEVEL, and
# ALSO fails when the advisory service cannot be reached: a security gate with
# no data must never report a pass.
#
# What it adds over a bare `npm audit --audit-level=high`: the npm registry's
# audit endpoint is a single network call that returns 503, or a spurious
# 400 "Invalid package tree", during registry incidents. That is
# indistinguishable, by exit code alone, from a real advisory. This script
# tells the two apart by looking for an actual report in the JSON output, and
# retries only the "no report" case.
#
# Usage:  scripts/npm-audit-gate.sh [extra npm audit flags...]
#   e.g.  scripts/npm-audit-gate.sh --omit=dev
# Env:    AUDIT_LEVEL   (default: high)  low|moderate|high|critical
#         AUDIT_ATTEMPTS(default: 4)
set -uo pipefail

level="${AUDIT_LEVEL:-high}"
attempts="${AUDIT_ATTEMPTS:-4}"
delay="${AUDIT_DELAY:-5}"

if ! command -v jq >/dev/null 2>&1; then
  echo "npm-audit-gate: jq is required (preinstalled on GitHub-hosted runners)" >&2
  exit 1
fi

# Severities that fail the build, given the configured level.
case "$level" in
  critical) counted='.critical' ;;
  high)     counted='.critical + .high' ;;
  moderate) counted='.critical + .high + .moderate' ;;
  low)      counted='.critical + .high + .moderate + .low' ;;
  *) echo "npm-audit-gate: unknown AUDIT_LEVEL '$level'" >&2; exit 1 ;;
esac

err_file="$(mktemp)"
trap 'rm -f "$err_file"' EXIT

for attempt in $(seq 1 "$attempts"); do
  report="$(npm audit --json --audit-level="$level" "$@" 2>"$err_file")"

  # A usable report has metadata.vulnerabilities. Anything else (an {"error":…}
  # object, HTML, an empty body) means the endpoint did not answer.
  if ! counts="$(printf '%s' "$report" | jq -c '.metadata.vulnerabilities' 2>/dev/null)" \
     || [ -z "$counts" ] || [ "$counts" = "null" ]; then
    echo "::warning::npm audit attempt ${attempt}/${attempts}: no report returned by the advisory service"
    printf '%s' "$report" | head -c 400
    head -c 400 "$err_file"
    echo
    if [ "$attempt" -lt "$attempts" ]; then
      echo "retrying in ${delay}s…"
      sleep "$delay"
      delay=$(( delay * 3 ))
    fi
    continue
  fi

  # Decide from the report itself rather than npm's exit code, so the gate's
  # threshold is explicit and does not depend on npm's flag semantics.
  failing="$(printf '%s' "$counts" | jq "${counted}")"
  echo "advisory counts: $counts"
  if [ "$failing" -gt 0 ]; then
    echo "::error::${failing} advisor(y|ies) at or above '${level}'"
    npm audit --audit-level="$level" "$@" || true   # human-readable detail
    exit 1
  fi
  echo "✔ no advisories at or above '${level}'"
  exit 0
done

echo "::error::npm audit could not be completed after ${attempts} attempts."
echo "The advisory service returned no report, so this gate has no data."
echo "Failing closed: it must not report a pass it cannot substantiate."
exit 1
