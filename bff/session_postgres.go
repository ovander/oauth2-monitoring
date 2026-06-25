package main

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresSessionStore is a durable, multi-instance SessionStore. Sessions and
// in-flight login state survive BFF restarts and are shared across instances,
// unlike MemorySessionStore. The full Session is stored as jsonb; created_at /
// last_seen are promoted to columns for server-side expiry.
type PostgresSessionStore struct {
	pool     *pgxpool.Pool
	idle     time.Duration
	absolute time.Duration
	loginTTL time.Duration
}

// Compile-time check that it satisfies the interface.
var _ SessionStore = (*PostgresSessionStore)(nil)

// NewPostgresSessionStore connects, verifies the connection, and ensures the
// schema exists.
func NewPostgresSessionStore(ctx context.Context, dsn string, idle, absolute time.Duration) (*PostgresSessionStore, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	s := &PostgresSessionStore{pool: pool, idle: idle, absolute: absolute, loginTTL: 10 * time.Minute}
	if err := s.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

// Close releases the connection pool.
func (s *PostgresSessionStore) Close() { s.pool.Close() }

func (s *PostgresSessionStore) migrate(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS bff_sessions (
			id         text PRIMARY KEY,
			data       jsonb       NOT NULL,
			created_at timestamptz NOT NULL,
			last_seen  timestamptz NOT NULL
		);
		CREATE TABLE IF NOT EXISTS bff_login_states (
			state      text PRIMARY KEY,
			verifier   text        NOT NULL,
			return_to  text        NOT NULL,
			created_at timestamptz NOT NULL
		);
	`)
	return err
}

// opCtx bounds each DB operation (the SessionStore interface carries no context).
func opCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 5*time.Second)
}

func (s *PostgresSessionStore) PutLogin(state string, ls loginState) {
	ctx, cancel := opCtx()
	defer cancel()
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO bff_login_states (state, verifier, return_to, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (state) DO UPDATE SET verifier = EXCLUDED.verifier,
			return_to = EXCLUDED.return_to, created_at = EXCLUDED.created_at`,
		state, ls.Verifier, ls.ReturnTo, ls.Created)
}

func (s *PostgresSessionStore) TakeLogin(state string) (loginState, bool) {
	ctx, cancel := opCtx()
	defer cancel()
	var ls loginState
	// Single-use: delete and return in one statement.
	err := s.pool.QueryRow(ctx,
		`DELETE FROM bff_login_states WHERE state = $1 RETURNING verifier, return_to, created_at`,
		state).Scan(&ls.Verifier, &ls.ReturnTo, &ls.Created)
	if err != nil {
		return loginState{}, false
	}
	if time.Since(ls.Created) > s.loginTTL {
		return loginState{}, false
	}
	return ls, true
}

func (s *PostgresSessionStore) Put(sess *Session) {
	ctx, cancel := opCtx()
	defer cancel()
	data, err := json.Marshal(sess)
	if err != nil {
		return
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO bff_sessions (id, data, created_at, last_seen)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, last_seen = EXCLUDED.last_seen`,
		sess.ID, data, sess.Created, sess.LastSeen)
}

func (s *PostgresSessionStore) Get(id string) (*Session, bool) {
	ctx, cancel := opCtx()
	defer cancel()
	var data []byte
	var created, lastSeen time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT data, created_at, last_seen FROM bff_sessions WHERE id = $1`, id).
		Scan(&data, &created, &lastSeen)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			// transient error — treat as absent rather than panic
		}
		return nil, false
	}
	now := time.Now()
	if now.Sub(created) > s.absolute || now.Sub(lastSeen) > s.idle {
		s.Delete(id)
		return nil, false
	}
	var sess Session
	if json.Unmarshal(data, &sess) != nil {
		return nil, false
	}
	return &sess, true
}

func (s *PostgresSessionStore) Delete(id string) {
	ctx, cancel := opCtx()
	defer cancel()
	_, _ = s.pool.Exec(ctx, `DELETE FROM bff_sessions WHERE id = $1`, id)
}

// sweep removes expired sessions and stale login state in bulk.
func (s *PostgresSessionStore) sweep() {
	ctx, cancel := opCtx()
	defer cancel()
	_, _ = s.pool.Exec(ctx,
		`DELETE FROM bff_sessions WHERE created_at < $1 OR last_seen < $2`,
		time.Now().Add(-s.absolute), time.Now().Add(-s.idle))
	_, _ = s.pool.Exec(ctx,
		`DELETE FROM bff_login_states WHERE created_at < $1`,
		time.Now().Add(-s.loginTTL))
}
