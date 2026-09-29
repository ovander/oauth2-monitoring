## What and why

<!-- What this changes and why. Link the issue if there is one ("Closes #…"). -->

## How it was tested

<!-- New or changed tests, and anything checked by hand in the browser. -->

- [ ] `./scripts/npm-audit-gate.sh --omit=dev` passes
- [ ] `npm run test:run` passes
- [ ] `npm run build` (vue-tsc + Vite) passes
- [ ] `cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...` passes
- [ ] No token reaches the browser, no new XSS sink, CSP unchanged or changed in both `deploy/Caddyfile` and `index.html`
- [ ] A line is added under `## [Unreleased]` in `CHANGELOG.md`

## Deploy notes

<!-- Delete what does not apply. -->
- New or changed BFF environment variable: <!-- name, default, also in bff/README.md and deploy/env/bff.env.example -->
- Caddy or CSP change: <!-- what, and which file in deploy/ -->
- Order with the Socrate server: <!-- e.g. needs Socrate vX.Y.Z deployed first -->
