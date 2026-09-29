# Contributing to the Socrate monitoring console

Thank you for your interest. The monitoring console is the security operations dashboard of the
Socrate OAuth 2.1 / OIDC platform: a Vue 3 SPA and a small Go Backend-for-Frontend in `bff/`. The
server it watches is [`ovander/go-oauth2`](https://github.com/ovander/go-oauth2); the BFF runtime
comes from [`ovander/backendkit`](https://github.com/ovander/backendkit). Contributions are
accepted under the project's licence, [Apache-2.0](LICENSE).

## Development setup

Requirements: Node.js 20, and Go for the BFF (the `toolchain` line in `bff/go.mod` downloads the
exact version, 1.27.1). A running Socrate server is needed to sign in.

```bash
git clone https://github.com/ovander/oauth2-monitoring && cd oauth2-monitoring
npm ci
cd bff && go run .          # BFF on 127.0.0.1:8090; configure it from bff/README.md
npm run dev                 # SPA on http://localhost:5180; Vite proxies /bff and /api to the BFF
```

## Security rules

This console is a Tier-0 surface, so a few rules are absolute. They are explained in
[SECURITY.md](SECURITY.md).

- **No tokens in the browser.** The SPA never sets an `Authorization` header and never stores a
  token in `localStorage` or `sessionStorage`; the BFF holds the tokens. Tests assert it.
- **No XSS sinks**: no `v-html`, `innerHTML`, `eval` or `document.write`.
- **The Content Security Policy** is set in `deploy/Caddyfile` and mirrored in `index.html`;
  change both together.
- **The BFF is an allowlist, never an open proxy.** It serves `/bff/*` and `/api/admin/*` only.
- Do not turn a fail-closed default into a fail-open one to make something work.

## Tests and checks

Run these before opening a pull request; CI runs the same and all of them are required:

```bash
./scripts/npm-audit-gate.sh --omit=dev   # fails on a high/critical advisory, or no audit data
npm run test:run                         # Vitest unit and integration tests
npm run build                            # vue-tsc type check + production build
cd bff && go vet ./... && go test -race ./...
cd bff && golangci-lint run ./...        # v2.14.0, built with Go 1.27.1
```

- A bug fix comes with a test that fails without it.

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
   `chore:`, `docs:`, `ci:`, `test:`).
3. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
4. Open the PR with the template filled in, including deploy notes (new BFF environment
   variable, Caddy or CSP change, order with the Socrate server).
5. CI must be green. The maintainer reviews and merges.

## Releases

The maintainer tags releases `vX.Y.Z` on `main` and deploys them with the kit in `deploy/` (see
[`deploy/README.md`](deploy/README.md)): artifacts are built locally and shipped to the host, so
no build toolchain runs in production.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
