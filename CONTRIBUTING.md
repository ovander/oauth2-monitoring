# Contributing to the Socrate monitoring console

Thank you for your interest. The Socrate monitoring console is part of the Socrate suite: it is
the security operations dashboard for Socrate, the suite's OAuth 2.1 / OpenID Connect server
(`ovander/go-oauth2`, not public yet), built as a Vue 3 SPA and a small Go Backend-for-Frontend in
`bff/`. The BFF runtime comes from [`ovander/backendkit`](https://github.com/ovander/backendkit),
and the sibling admin console is [`ovander/oauth2-admin`](https://github.com/ovander/oauth2-admin).
Contributions are accepted under the project's licence, [Apache-2.0](LICENSE).

## Development setup

Requirements: Node.js 20, and Go for the BFF (the `toolchain` line in `bff/go.mod` downloads the
exact version, 1.27.1). Signing in needs a running Socrate server with a confidential OAuth client
registered for the console (redirect URI `http://localhost:5180/bff/callback` for local work).

```bash
git clone https://github.com/ovander/oauth2-monitoring && cd oauth2-monitoring
npm ci
cp .env.example .env.local        # role lists and the dev proxy target
```

Then run the BFF and the SPA in two terminals, both from the repository root:

```bash
# Terminal 1: the BFF on 127.0.0.1:8090. It needs BFF_CLIENT_ID, BFF_CLIENT_SECRET,
# BFF_OAUTH_PUBLIC_URL, BFF_PUBLIC_ORIGIN and, over http, BFF_COOKIE_SECURE=false;
# see bff/README.md.
(cd bff && go run .)

# Terminal 2: the SPA on http://localhost:5180; Vite proxies /bff and /api to the BFF.
npm run dev
```

## Design rules

This console is a Tier-0 surface, so a few rules are absolute. They are explained in
[SECURITY.md](SECURITY.md).

- **No tokens in the browser.** The SPA never sets an `Authorization` header and never stores
  anything in `localStorage` or `sessionStorage`; the BFF holds the tokens. Tests assert it.
- **No XSS sinks**: no `v-html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`,
  `new Function`, `document.write` or `javascript:` URLs.
- **The Content Security Policy** is set in `deploy/Caddyfile` and mirrored in `index.html`;
  change both together.
- **The BFF is an allowlist, never an open proxy.** It serves `/bff/*`, `/api/admin/*` and the
  public `GET /api/version` probe only; unsafe methods keep requiring `X-CSRF-Token` and
  non-canonical paths stay refused.
- **Fail closed.** No valid session means `401`. Do not turn a fail-closed default into a
  fail-open one to make something work, and do not enable the migration-only pass-through
  settings (`BFF_PHASE1_PASSTHROUGH`, `BFF_ALLOW_PASSTHROUGH`).

## Tests and checks

Run these before opening a pull request; they are the same checks as CI, and all of them are
required:

```bash
./scripts/npm-audit-gate.sh --omit=dev   # fails on a high/critical advisory, or no audit data
npm run test:run                         # Vitest unit and integration tests
npm run build                            # vue-tsc type check + production build
(cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...)   # lint v2.14.0
```

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `ci/…`, `docs/…`).
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
   `chore:`, `docs:`, `ci:`, `test:`).
3. Keep one change per pull request.
4. A bug fix comes with a test that fails without it.
5. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
6. Open the pull request with the template filled in, including deploy notes (new BFF environment
   variable, Caddy or CSP change, order with the Socrate server).
7. CI must be green. The maintainer reviews and merges.

## Releases

The maintainer tags releases `vX.Y.Z` on `main`, moving the `[Unreleased]` changelog section
under the new version, and deploys them with the kit in `deploy/` (see
[`deploy/README.md`](deploy/README.md)): artifacts are built locally, pinned to the tag, and
shipped to the host, so no build toolchain runs in production.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
