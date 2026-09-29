# CLAUDE.md — oauth2-monitoring

Standing instructions for Claude Code in this repository. Read this file, `CONTRIBUTING.md` and
`SECURITY.md` before any change. The Socrate server and its admin API live in
`ovander/go-oauth2`; the BFF runtime (sessions, CSRF, PKCE, proxy) comes from
`ovander/backendkit`; the sibling admin console is `ovander/oauth2-admin`.

## Project in one paragraph

The Socrate security monitoring console: a Vue 3 + Pinia + PrimeVue 4 SPA (TypeScript) and a Go
Backend-for-Frontend in `bff/`. The BFF is the confidential OAuth client: it runs Authorization
Code + PKCE server-side, keeps the tokens in a server-side session (in memory, or Postgres with
`BFF_SESSION_DSN`) and gives the browser only an opaque `__Host-` cookie. It proxies an allowlist
(`/bff/*`, `/api/admin/*`, including the Server-Sent Events stream) to the loopback-only admin
API, injecting the bearer. Viewer routes are read-only; alerts, blocked IPs, audit logs and
settings need an admin role. The deploy kit in `deploy/` also installs the Socrate server itself.

## Sources of truth, in order

1. The code. Read it before proposing changes; do not describe code you have not opened.
2. `SECURITY.md` — the controls the code must keep enforcing, and the deployment requirements.
3. `bff/README.md`, `docs/adr/0001-backend-for-frontend.md` and `deploy/README.md`.

## Hard rules

- **No tokens in the browser.** No `Authorization` header from the SPA, nothing in
  `localStorage`/`sessionStorage`; auth state comes from `GET /bff/session`. Keep the tests that
  assert it.
- **No XSS sinks.** No `v-html`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `eval`,
  `new Function`, `document.write`, `javascript:` URLs.
- **CSP.** `deploy/Caddyfile` and the `index.html` meta tag change together.
- **BFF allowlist.** Do not add a catch-all route; unsafe methods keep requiring `X-CSRF-Token`;
  non-canonical paths stay refused.
- **Fail closed.** No valid session ⇒ 401. Do not enable `BFF_ALLOW_PASSTHROUGH` or
  `BFF_PHASE1_PASSTHROUGH` outside a documented migration step.
- **Never weaken a gate** to get green: no skipped or deleted tests, no `//nolint` without a
  one-line reason, no `continue-on-error`, no required check removed, no lowered audit level.
- **Secrets** never enter the repository: no `.env` (only `.env.example`), keys or client
  secrets. The BFF secrets live in `/etc/socrate/bff.env` on the host.
- **Scope.** One change per PR; do not widen a PR with unrelated fixes (open a separate one).

## Local gate (the same checks as CI)

```bash
./scripts/npm-audit-gate.sh --omit=dev
npm run test:run
npm run build
cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...
```

## Git workflow

- Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `ci/…`, `docs/…`. Conventional Commits.
- Open a PR; never push to `main`, never force-push a shared branch, never merge with red CI.
  The owner merges.
- Each PR adds a line under `## [Unreleased]` in `CHANGELOG.md`, and says in its body what it
  changes, how it was tested, and any deploy note.

## Releases and deploys (the owner runs them)

A release is a tag `vX.Y.Z` on `main`, with the `[Unreleased]` changelog section moved under the
new version. Artifacts are built locally and shipped with `deploy/scripts/push.sh`. Do not tag or
deploy unless asked.
