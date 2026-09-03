package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ovander/backendkit/bff"
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

// P3-28: the SessionStore interface cannot return errors, but a store that
// silently drops writes turns every outage into a mystery logout (or, for
// Delete, a logout that did not happen). Every statement result is logged.

func (s *PostgresSessionStore) PutLogin(state string, ls loginState) {
	ctx, cancel := opCtx()
	defer cancel()
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO bff_login_states (state, verifier, return_to, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (state) DO UPDATE SET verifier = EXCLUDED.verifier,
			return_to = EXCLUDED.return_to, created_at = EXCLUDED.created_at`,
		state, ls.Verifier, ls.ReturnTo, ls.Created); err != nil {
		log.Printf("bff/pg: put login state: %v", err)
	}
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
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("bff/pg: take login state: %v", err)
		}
		return loginState{}, false
	}
	if time.Since(ls.Created) > s.loginTTL {
		return loginState{}, false
	}
	return ls, true
}

func (s *PostgresSessionStore) Put(sess *bff.Session) {
	ctx, cancel := opCtx()
	defer cancel()
	snap := sess.Snapshot()
	data, err := json.Marshal(snap)
	if err != nil {
		log.Printf("bff/pg: marshal session: %v", err)
		return
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO bff_sessions (id, data, created_at, last_seen)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, last_seen = EXCLUDED.last_seen`,
		sess.ID(), data, snap.Created, snap.LastSeen); err != nil {
		log.Printf("bff/pg: put session: %v", err)
	}
}

// Touch slides the idle window with an UPDATE only (P3-29): unlike Put it
// never re-creates a row, so a read path racing a logout cannot resurrect the
// session. The session data itself is unchanged by a touch.
func (s *PostgresSessionStore) Touch(sess *bff.Session) {
	ctx, cancel := opCtx()
	defer cancel()
	if _, err := s.pool.Exec(ctx,
		`UPDATE bff_sessions SET last_seen = $2 WHERE id = $1`,
		sess.ID(), sess.Snapshot().LastSeen); err != nil {
		log.Printf("bff/pg: touch session: %v", err)
	}
}

func (s *PostgresSessionStore) Get(id string) (*bff.Session, bool) {
	ctx, cancel := opCtx()
	defer cancel()
	var data []byte
	var created, lastSeen time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT data, created_at, last_seen FROM bff_sessions WHERE id = $1`, id).
		Scan(&data, &created, &lastSeen)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			// Transient error: treat as absent (fail closed) but say so.
			log.Printf("bff/pg: get session: %v", err)
		}
		return nil, false
	}
	now := time.Now()
	if now.Sub(created) > s.absolute || now.Sub(lastSeen) > s.idle {
		s.Delete(id)
		return nil, false
	}
	var snap bff.SessionSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		log.Printf("bff/pg: decode session: %v", err)
		return nil, false
	}
	return bff.NewSessionFromSnapshot(snap), true
}

// Delete satisfies bff.SessionStore; failures are logged. Callers that need
// to know (logout) use DeleteSession.
func (s *PostgresSessionStore) Delete(id string) {
	if err := s.DeleteSession(id); err != nil {
		log.Printf("bff/pg: delete session: %v", err)
	}
}

// DeleteSession removes the row and reports a failure (P3-28).
func (s *PostgresSessionStore) DeleteSession(id string) error {
	ctx, cancel := opCtx()
	defer cancel()
	_, err := s.pool.Exec(ctx, `DELETE FROM bff_sessions WHERE id = $1`, id)
	return err
}

// Sweep removes expired sessions and stale login state in bulk.
func (s *PostgresSessionStore) Sweep() {
	ctx, cancel := opCtx()
	defer cancel()
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM bff_sessions WHERE created_at < $1 OR last_seen < $2`,
		time.Now().Add(-s.absolute), time.Now().Add(-s.idle)); err != nil {
		log.Printf("bff/pg: sweep sessions: %v", err)
	}
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM bff_login_states WHERE created_at < $1`,
		time.Now().Add(-s.loginTTL)); err != nil {
		log.Printf("bff/pg: sweep login states: %v", err)
	}
}
