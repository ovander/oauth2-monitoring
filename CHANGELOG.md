# Changelog

All notable changes to the Socrate monitoring console are documented here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.1] - 2026-09-29

Patch release. The BFF attributes its own Socrate calls (sign-in, refresh, sign-out, step-up) to
the browser, so Socrate audits and rate-limits the user's IP and User-Agent rather than the BFF,
and no longer forwards a client-supplied `X-Forwarded-For`; builds move to Node.js 24. Requires
backendkit v1.15.0. No Caddy change, no new environment variable. Works with Socrate v1.5.0 and
later.

### Security

- **Browser attribution toward Socrate, and no forged `X-Forwarded-For` through the proxy.** The
  BFF now tells Socrate which browser each call is for (`bff/attribution.go`, backendkit
  v1.15.0 client attribution): the code exchange, refresh, logout revocations and step-up carry
  `X-Forwarded-For: <client IP>` and the browser's `User-Agent` instead of appearing as
  `127.0.0.1` / `Go-http-client`. Proxied requests (`/api/admin/*`, including the event stream,
  and `/api/version`) used to append the peer to the inbound `X-Forwarded-For`, so a peer
  reaching the BFF without Caddy could put a forged address left-most, where Socrate reads it;
  they now send `<client IP>, <BFF peer>` with the client IP resolved by the BFF (from Caddy's
  header only over loopback). No deploy step beyond the release; the Caddy site is unchanged.

### Changed

- Build and CI toolchain: Node.js 20 (end of life since 2026-04-30) → Node.js 24 LTS; `.nvmrc` and `engines` pin it.

## [1.0.0] - 2026-09-29

First tagged release of the Socrate monitoring console: a Vue 3 security operations dashboard with
a Go Backend-for-Frontend that keeps every token server-side. It ships under Apache-2.0, with a
light theme by default and a dark mode, nothing kept in browser storage, `/api/version` routed so
the version badge and stale-tab detection work, and the badge showing the console and server
builds with their toolchains. Requires Socrate v1.4.0 or later (v1.5.0 for the server toolchain in
the badge).

### Added

- **Build toolchains in the version badge**: a plain-text tooltip (`title` and `aria-label`) shows
  the console's version, build date, Node.js and Vite versions, and the server's version, commit,
  branch, `build_time` and `go_version` (optional: servers up to v1.4.0 do not send it); the badge
  no longer renders a doubled `v` ("vv1.4.2") for a server version that already starts with `v`.
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

- README: a row of self-updating badges (CI status, licence, Go version) under the title.
- **Documentation** brought to the suite's standard: the README gains a pitch, prerequisites,
  architecture, the light/dark theme, screenshots and a regenerated project tree, and drops the
  history of the removed root `Dockerfile`, `nginx.conf` and `.env.production`; `.env.example`
  lists only what the SPA and the Vite dev server read (`VITE_ADMIN_ROLES`, `VITE_VIEWER_ROLES`,
  `DEV_BFF_TARGET`) instead of the retired public-client settings; `bff/README.md` gives run
  instructions that work (registered client, container networking), documents `BFF_LOGIN_RATE`
  and `BFF_ELEVATE_RATE`, and describes the pass-through once, as migration-only;
  `deploy/README.md` documents tag-pinned deploys (`REF`, `SOCRATE_REF`). Docs use
  `example.com` host names, state controls instead of review IDs, and no longer link the private
  server repository. The ADR gets a plain Status/Date header. `SECURITY.md`, `CONTRIBUTING.md`
  (the dev setup no longer leaves you in `bff/`) and the issue and pull-request templates follow.
- `BFF-DESIGN.md` is now [`docs/adr/0001-backend-for-frontend.md`](docs/adr/0001-backend-for-frontend.md),
  marked accepted and implemented.

### Fixed

- **Version badge now shows the server commit**: the version store read `git_commit` and
  `build_date` from Socrate's `GET /api/version`, which returns `version`, `commit`, `branch` and
  `build_time`, so the badge never showed the backend commit. The store and `useVersionInfo` now
  read the server's field names; a unit test parses a realistic body. Stale-tab detection (keyed on
  `version`) is unchanged.
- **Nothing in browser storage, as SECURITY.md states**: loglevel persisted every logger's level
  to `localStorage` (six `loglevel:*` entries on load). Levels are no longer persisted, entries left
  by earlier builds are removed at startup, and `window.__setLogLevel` now also reaches the named
  loggers (it read a registry property that does not exist, so only the root logger changed), with
  the `[name]` prefix kept through level changes and added once per logger. The
  test storage mock now treats property access as item access, like a real `Storage`, so writes of
  the form `localStorage[key] = value` can no longer slip past the storage assertions.
- **Caddy: the monitoring console's BFF routes never reached the BFF.** `deploy/Caddyfile` and
  `bff/Caddyfile.example` used a bare `reverse_proxy @bff` next to a catch-all `handle`; Caddy
  orders `handle` before `reverse_proxy`, so `/bff/*` and `/api/admin/*` got the SPA's
  `index.html` and sign-in could not work. The proxy is now inside `handle @bff`.
- README and `bff/README.md` described the retired browser-held-token design (in-SPA PKCE, callback
  and setup views, tokens in memory, nginx headers, a session-less pass-through fallback). They now
  match the code: cookie-only SPA, server-side sessions, CSRF, step-up, and a BFF that refuses to
  start without a client unless the pass-through is enabled deliberately.
- **The server version badge and stale-tab detection never worked**: nothing routed
  `GET /api/version`, so Caddy answered it with the SPA's `index.html`, the JSON parse failed
  quietly, the badge showed no server version and the "new version deployed" toast never fired.
  The BFF now allowlists that exact path (`GET`/`HEAD` only; other methods `405`) and forwards it to
  the Socrate issuer (`BFF_OAUTH_UPSTREAM`) with the browser's cookie and `Authorization` header
  dropped, and `deploy/Caddyfile` and `bff/Caddyfile.example` route it to the BFF. Deploy note: add
  `/api/version` to the host's `@bff` matcher.

### Removed

- Internal audits and plans (`AUDIT.md`, `MONITORING-SPA-TIER0-AUDIT.md`, `REMEDIATION-PLAN.md`,
  `SECURITY-MONITORING-REVIEW.md`, `CR-public-client.docx`) and the tracked `.idea/` IDE files left
  the repository. `.gitignore` now keeps `.idea/`, every `.env.*` except `.env.example`, and
  root-level office documents out.

Changes before this changelog was introduced are in the git history.

[Unreleased]: https://github.com/ovander/oauth2-monitoring/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/ovander/oauth2-monitoring/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ovander/oauth2-monitoring/releases/tag/v1.0.0
