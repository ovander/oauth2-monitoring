package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
	"github.com/ovander/backendkit/bff"
)

// stores are the BFF's server-side state, both from backendkit: the
// authenticated sessions and the pending logins (PKCE verifier, LoginBinding
// nonce and return path, between /bff/login and /bff/callback).
//
// Without BFF_SESSION_DSN both live in memory (one instance; a restart signs
// everyone out). With it both live in PostgreSQL, encrypted with AES-256-GCM
// under BFF_SESSION_KEY, so they survive restarts and are shared by several
// instances.
type stores struct {
	sessions bff.SessionStore
	pending  bff.PendingLoginStore

	// sessionErrors counts the failed statements a durable session store
	// reports to its error handler. bff.SessionStore.Delete returns nothing,
	// so logout compares this count around its Delete to learn whether the
	// delete may have failed (P3-28). It stays zero for the memory store,
	// whose Delete cannot fail.
	sessionErrors atomic.Uint64

	db *sql.DB // nil for the memory stores
}

// newMemoryStores builds the single-instance stores.
func newMemoryStores(idle, absolute time.Duration) *stores {
	return &stores{
		sessions: bff.NewMemoryStore(idle, absolute),
		pending:  bff.NewMemoryPendingLoginStore(bff.DefaultPendingLoginTTL, bff.DefaultMaxPendingLogins),
	}
}

// openStores builds the stores the configuration selects: Postgres when
// BFF_SESSION_DSN is set, memory otherwise. It fails, and the BFF refuses to
// start, when the database is unreachable or, with the managed schema, when
// the tables, their columns or the role's grants are not as
// deploy/sql/bff-session-store.sql leaves them.
func openStores(ctx context.Context, cfg *Config) (*stores, error) {
	if cfg.SessionDSN == "" {
		return newMemoryStores(cfg.SessionIdle, cfg.SessionAbsolute), nil
	}
	db, err := sql.Open("pgx", cfg.SessionDSN)
	if err != nil {
		return nil, fmt.Errorf("open session database: %w", err)
	}
	// Bounded: a burst of requests must not exhaust the database's
	// connection slots.
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)
	st, err := openPostgresStores(ctx, db, cfg.sessionKey, cfg.SessionIdle, cfg.SessionAbsolute, cfg.SessionSchema)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return st, nil
}

// openPostgresStores builds both Postgres stores on db, with the schema
// options BFF_SESSION_SCHEMA selects. The caller owns db until it succeeds;
// then Close closes it.
func openPostgresStores(ctx context.Context, db *sql.DB, key []byte, idle, absolute time.Duration, schema string) (*stores, error) {
	var sessionSchema bff.PostgresStoreOption
	var pendingSchema bff.PendingLoginStoreOption
	switch schema {
	case SessionSchemaManaged:
		sessionSchema, pendingSchema = bff.WithPostgresManagedSchema(), bff.WithPendingLoginManagedSchema()
	case SessionSchemaAuto:
		sessionSchema, pendingSchema = bff.WithPostgresAutoSchema(), bff.WithPendingLoginAutoSchema()
	default:
		return nil, fmt.Errorf("unknown session schema %q (want %q or %q)", schema, SessionSchemaManaged, SessionSchemaAuto)
	}
	st := &stores{db: db}
	sessions, err := bff.NewPostgresStore(ctx, db, key, idle, absolute, sessionSchema,
		bff.WithPostgresErrorHandler(func(op string, err error) {
			st.sessionErrors.Add(1)
			log.Printf("bff: session store: %s: %v", op, err)
		}))
	if err != nil {
		return nil, err
	}
	pending, err := bff.NewPostgresPendingLoginStore(ctx, db, key, bff.DefaultPendingLoginTTL, pendingSchema)
	if err != nil {
		return nil, err
	}
	st.sessions, st.pending = sessions, pending
	return st, nil
}

// errSessionDeleteFailed reports that the session store could not confirm a
// logout's delete.
var errSessionDeleteFailed = errors.New("the session store reported a failed statement during the delete")

// deleteSession ends a session and reports whether the store may have failed
// to (P3-28). backendkit's PostgresStore.Delete tombstones the row and
// returns nothing; a failed statement goes to the error handler, which counts
// it, and the handler runs before Delete returns. Any failure counted while
// this Delete ran is reported: a failure of a concurrent request can make a
// clean delete look failed (only while the database is failing), but a failed
// delete is never reported as clean.
func (st *stores) deleteSession(id string) error {
	before := st.sessionErrors.Load()
	st.sessions.Delete(id)
	if st.sessionErrors.Load() != before {
		return errSessionDeleteFailed
	}
	return nil
}

// sweep prunes expired sessions (and, on Postgres, tombstones older than
// bff.PostgresStoreTombstoneTTL) and expired pending logins.
func (st *stores) sweep(ctx context.Context) {
	st.sessions.Sweep()
	st.pending.Sweep(ctx)
}

// Close releases the database, if any.
func (st *stores) Close() error {
	if st.db == nil {
		return nil
	}
	return st.db.Close()
}
