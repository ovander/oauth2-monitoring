# Changelog

All notable changes to the Socrate monitoring console are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Light theme and theme toggle**: the console now opens in a light colour scheme (following the
  system setting on first visit) with a sun/moon toggle in the sidebar; the dark scheme moves from
  near-black to slate. The choice is kept in a `theme` preference cookie, not in browser storage.
  Charts read their axis, legend and grid colours from the palette so they follow the scheme.
- **Tag-pinned deploys**: `build.sh`/`push.sh` take `REF` (this repo, or the first argument) and
  `SOCRATE_REF` (go-oauth2) and build each from a throwaway `git worktree` of that ref, so a release
  is exactly the committed source. The Socrate binaries are version-stamped (`-X
  …/internal/version.*`), with the module path read from the built tree's `go.mod` (it changed in
  go-oauth2 v1.4.0), and the build fails if the stamp is missing instead of shipping `version=dev`.
- **Apache-2.0 licence** (`LICENSE`, and `license` in `package.json`) and the contributor kit:
  `SECURITY.md` (private vulnerability reporting, scope, supported versions and the security
  posture), `CONTRIBUTING.md`, `CLAUDE.md`, `CODEOWNERS`, issue forms, a pull-request template and
  this changelog.

### Changed

- `BFF-DESIGN.md` is now [`docs/adr/0001-backend-for-frontend.md`](docs/adr/0001-backend-for-frontend.md),
  marked accepted and implemented.

### Fixed

- **Caddy: the monitoring console's BFF routes never reached the BFF.** `deploy/Caddyfile` and
  `bff/Caddyfile.example` used a bare `reverse_proxy @bff` next to a catch-all `handle`; Caddy
  orders `handle` before `reverse_proxy`, so `/bff/*` and `/api/admin/*` got the SPA's
  `index.html` and sign-in could not work. The proxy is now inside `handle @bff`.
- README and `bff/README.md` described the retired browser-held-token design (in-SPA PKCE, callback
  and setup views, tokens in memory, nginx headers, a session-less pass-through fallback). They now
  match the code: cookie-only SPA, server-side sessions, CSRF, step-up, and a BFF that refuses to
  start without a client unless the pass-through is enabled deliberately.

### Removed

- Internal audits and plans (`AUDIT.md`, `MONITORING-SPA-TIER0-AUDIT.md`, `REMEDIATION-PLAN.md`,
  `SECURITY-MONITORING-REVIEW.md`, `CR-public-client.docx`) and the tracked `.idea/` IDE files left
  the repository. `.gitignore` now keeps `.idea/`, every `.env.*` except `.env.example`, and
  root-level office documents out.

Changes before this changelog was introduced are in the git history.
