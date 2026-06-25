package main

import (
	"encoding/json"
	"net/url"
	"testing"
	"time"
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

// The Session must round-trip cleanly through JSON, since the Postgres store
// persists it in a jsonb column.
func TestSessionJSONRoundTrip(t *testing.T) {
	in := &Session{
		ID:           "sid",
		AccessToken:  "at",
		RefreshToken: "rt",
		IDToken:      "id",
		AccessExpiry: time.Unix(1_700_000_000, 0).UTC(),
		User:         UserInfo{Sub: "u1", Email: "a@b.c", Name: "Admin", Roles: []string{"admin", "monitor_admin"}},
		CSRF:         "csrf-1",
		Created:      time.Unix(1, 0).UTC(),
		LastSeen:     time.Unix(2, 0).UTC(),
	}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out Session
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if out.AccessToken != "at" || out.RefreshToken != "rt" || out.User.Sub != "u1" || out.CSRF != "csrf-1" {
		t.Fatalf("round-trip mismatch: %+v", out)
	}
	if !out.AccessExpiry.Equal(in.AccessExpiry) || len(out.User.Roles) != 2 {
		t.Fatalf("round-trip lost fields: %+v", out)
	}
}
