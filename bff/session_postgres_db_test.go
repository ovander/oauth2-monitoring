package main

import (
	"context"
	"os"
	"testing"
	"time"
)

// pgStore opens the Postgres store against BFF_TEST_DATABASE_URL, a scratch
// database the test may write to.
func pgStore(t *testing.T) *PostgresSessionStore {
	t.Helper()
	dsn := os.Getenv("BFF_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("BFF_TEST_DATABASE_URL not set: the Postgres store needs a scratch database")
	}
	s, err := NewPostgresSessionStore(context.Background(), dsn, time.Hour, time.Hour)
	if err != nil {
		t.Fatalf("NewPostgresSessionStore: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

// The login state round-trips through Postgres with its LoginBinding nonce:
// without it the callback's Verify never matches and every sign-in fails.
func TestPostgresSessionStore_LoginStateKeepsTheNonce(t *testing.T) {
	s := pgStore(t)
	state := "st-" + time.Now().Format("150405.000000000")
	in := loginState{Verifier: "v", ReturnTo: "/alerts", Nonce: "nonce-1", Created: time.Now().UTC().Truncate(time.Microsecond)}
	s.PutLogin(state, in)

	got, ok := s.TakeLogin(state)
	if !ok || got.Verifier != in.Verifier || got.ReturnTo != in.ReturnTo || got.Nonce != in.Nonce || !got.Created.Equal(in.Created) {
		t.Fatalf("TakeLogin = %+v, %v; want %+v", got, ok, in)
	}
	if _, ok := s.TakeLogin(state); ok {
		t.Error("a login state must be single-use")
	}
}

// A table created before the nonce column existed is upgraded in place.
func TestPostgresSessionStore_UpgradesAnOldLoginStateTable(t *testing.T) {
	s := pgStore(t)
	ctx := context.Background()
	if _, err := s.pool.Exec(ctx, `ALTER TABLE bff_login_states DROP COLUMN IF EXISTS nonce`); err != nil {
		t.Fatal(err)
	}
	if err := s.migrate(ctx); err != nil {
		t.Fatalf("migrate over an old table: %v", err)
	}
	s.PutLogin("st-upgrade", loginState{Verifier: "v", Nonce: "n", Created: time.Now()})
	if got, ok := s.TakeLogin("st-upgrade"); !ok || got.Nonce != "n" {
		t.Fatalf("after upgrade: %+v, %v", got, ok)
	}
}
