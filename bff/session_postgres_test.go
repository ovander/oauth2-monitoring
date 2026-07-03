package main

import (
	"encoding/json"
	"net/url"
	"testing"
	"time"

	"github.com/ovander/backendkit/bff"
)

func mustURL(t *testing.T, s string) *url.URL {
	t.Helper()
	u, err := url.Parse(s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return u
}

// NewServerWithStore must use the injected store (e.g. the Postgres store in
// production) rather than always building the in-memory one.
func TestNewServerWithStore_UsesInjectedStore(t *testing.T) {
	cfg := &Config{
		AdminUpstream: "http://127.0.0.1:8081", adminURL: mustURL(t, "http://127.0.0.1:8081"),
		OAuthUpstream: "http://127.0.0.1:8080", oauthURL: mustURL(t, "http://127.0.0.1:8080"),
		OAuthPublicURL: "https://s", PublicOrigin: "https://m",
		ClientID:    "c",
		SessionIdle: time.Minute, SessionAbsolute: time.Hour,
	}
	injected := NewMemorySessionStore(cfg.SessionIdle, cfg.SessionAbsolute)
	s := NewServerWithStore(cfg, injected)
	if s.store != injected {
		t.Fatal("NewServerWithStore did not use the injected store")
	}
}

// The Session must round-trip cleanly through JSON via Snapshot()/
// NewSessionFromSnapshot(), since that is exactly what
// PostgresSessionStore.Put/Get do to persist a *bff.Session in a jsonb column
// (bff.Session's fields are private, so it cannot be marshalled directly).
func TestSessionJSONRoundTrip(t *testing.T) {
	in := bff.NewSessionFromSnapshot(bff.SessionSnapshot{
		ID:           "sid",
		AccessToken:  "at",
		RefreshToken: "rt",
		IDToken:      "id",
		AccessExpiry: time.Unix(1_700_000_000, 0).UTC(),
		User:         bff.UserInfo{Sub: "u1", Email: "a@b.c", Name: "Admin", Roles: []string{"admin", "monitor_admin"}},
		CSRF:         "csrf-1",
		Created:      time.Unix(1, 0).UTC(),
		LastSeen:     time.Unix(2, 0).UTC(),
	})

	b, err := json.Marshal(in.Snapshot())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded bff.SessionSnapshot
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out := bff.NewSessionFromSnapshot(decoded)

	if out.AccessToken() != "at" || out.RefreshToken() != "rt" || out.User().Sub != "u1" || out.CSRF() != "csrf-1" {
		t.Fatalf("round-trip mismatch: %+v", out.Snapshot())
	}
	if !out.Snapshot().AccessExpiry.Equal(in.Snapshot().AccessExpiry) || len(out.User().Roles) != 2 {
		t.Fatalf("round-trip lost fields: %+v", out.Snapshot())
	}
}
