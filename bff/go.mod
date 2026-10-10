module github.com/ovander/oauth2-monitoring/bff

// The Go that builds, tests and ships this BFF: the language minimum, the
// GODEBUG defaults and, with no toolchain line, the toolchain (GOTOOLCHAIN=auto
// fetches it). CI reads this line (go-version-file) and fails if it or
// bff/Dockerfile's golang image drift apart.
go 1.27.2

require (
	github.com/jackc/pgx/v5 v5.9.2
	github.com/ovander/backendkit v1.21.0
)

require (
	github.com/google/uuid v1.6.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/sirupsen/logrus v1.9.3 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.40.0 // indirect
)
