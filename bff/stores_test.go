package main

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ovander/backendkit/bff"
)

func authConfig(t *testing.T) *Config {
	t.Helper()
	return &Config{
		AdminUpstream: "http://127.0.0.1:8081", adminURL: mustURL(t, "http://127.0.0.1:8081"),
		OAuthUpstream: "http://127.0.0.1:8080", oauthURL: mustURL(t, "http://127.0.0.1:8080"),
		OAuthPublicURL: "https://s", PublicOrigin: "https://m",
		ClientID:    "c",
		SessionIdle: time.Minute, SessionAbsolute: time.Hour,
	}
}

func mustURL(t *testing.T, s string) *url.URL {
	t.Helper()
	u, err := url.Parse(s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return u
}

// NewServerWithStores must use the injected stores (Postgres in production)
// rather than always building the in-memory ones.
func TestNewServerWithStores_UsesInjectedStores(t *testing.T) {
	st := newMemoryStores(time.Minute, time.Hour)
	s := NewServerWithStores(authConfig(t), st)
	if s.stores != st || s.store != st.sessions || s.gateway.Store != st.sessions {
		t.Fatal("NewServerWithStores did not use the injected stores")
	}
}

// Without stores (or BFF_SESSION_DSN) both stores are backendkit's in-memory
// ones.
func TestNewServer_DefaultsToMemoryStores(t *testing.T) {
	s := NewServer(authConfig(t))
	if _, ok := s.store.(*bff.MemoryStore); !ok {
		t.Fatalf("sessions = %T, want *bff.MemoryStore", s.store)
	}
	if _, ok := s.stores.pending.(*bff.MemoryPendingLoginStore); !ok {
		t.Fatalf("pending = %T, want *bff.MemoryPendingLoginStore", s.stores.pending)
	}

	st, err := openStores(context.Background(), authConfig(t))
	if err != nil {
		t.Fatalf("openStores without a DSN: %v", err)
	}
	if _, ok := st.sessions.(*bff.MemoryStore); !ok {
		t.Fatalf("openStores without a DSN: sessions = %T, want *bff.MemoryStore", st.sessions)
	}
	if err := st.Close(); err != nil {
		t.Fatalf("Close on the memory stores: %v", err)
	}
}

func TestOpenPostgresStores_RejectsAnUnknownSchema(t *testing.T) {
	if _, err := openPostgresStores(context.Background(), nil, testKey, time.Hour, time.Hour, "migrate"); err == nil ||
		!strings.Contains(err.Error(), "migrate") {
		t.Fatalf("want an unknown-schema error, got %v", err)
	}
}

// A full pending-login store refuses the login with 503 and does not send the
// browser to Socrate (it could only come back to a refused callback).
func TestLoginAnswers503WhenPendingLoginsAreFull(t *testing.T) {
	h := newPhase2HarnessWithStores(t, &stores{pending: bff.NewMemoryPendingLoginStore(bff.DefaultPendingLoginTTL, 1)})

	first := h.do(http.MethodGet, "/bff/login", nil)
	if first.Code != http.StatusFound {
		t.Fatalf("first login = %d, want 302", first.Code)
	}
	second := h.do(http.MethodGet, "/bff/login", nil)
	if second.Code != http.StatusServiceUnavailable {
		t.Fatalf("login with a full store = %d, want 503", second.Code)
	}
	if loc := second.Header().Get("Location"); loc != "" {
		t.Fatalf("a refused login still redirected to %q", loc)
	}
	if second.Header().Get("Retry-After") == "" {
		t.Error("503 without Retry-After")
	}

	// Finishing the first login frees its slot.
	loc, _ := url.Parse(first.Header().Get("Location"))
	if cb := h.do(http.MethodGet, "/bff/callback?state="+loc.Query().Get("state")+"&code=c", loginCookie(first)); cb.Code != http.StatusFound {
		t.Fatalf("callback = %d", cb.Code)
	}
	if third := h.do(http.MethodGet, "/bff/login", nil); third.Code != http.StatusFound {
		t.Fatalf("login after the slot was freed = %d, want 302", third.Code)
	}
}

// A state is accepted once: replaying the callback (same browser, same
// binding cookie) is refused and mints no second session.
func TestCallbackStateIsSingleUse(t *testing.T) {
	h := newPhase2Harness(t)
	login := h.do(http.MethodGet, "/bff/login", nil)
	loc, _ := url.Parse(login.Header().Get("Location"))
	target := "/bff/callback?state=" + loc.Query().Get("state") + "&code=c"

	if cb := h.do(http.MethodGet, target, loginCookie(login)); cb.Code != http.StatusFound || sessionCookie(cb) == nil {
		t.Fatalf("first callback = %d", cb.Code)
	}
	again := h.do(http.MethodGet, target, loginCookie(login))
	if again.Code != http.StatusBadRequest || sessionCookie(again) != nil {
		t.Fatalf("replayed callback = %d, want 400 and no session", again.Code)
	}
}

type sweepCountingSessions struct {
	bff.SessionStore
	sweeps atomic.Int32
}

func (s *sweepCountingSessions) Sweep() { s.sweeps.Add(1); s.SessionStore.Sweep() }

type sweepCountingPending struct {
	bff.PendingLoginStore
	sweeps atomic.Int32
}

func (s *sweepCountingPending) Sweep(ctx context.Context) {
	s.sweeps.Add(1)
	s.PendingLoginStore.Sweep(ctx)
}

// The sweeper's tick prunes both stores.
func TestSweepOnceSweepsBothStores(t *testing.T) {
	mem := newMemoryStores(time.Minute, time.Hour)
	sessions := &sweepCountingSessions{SessionStore: mem.sessions}
	pending := &sweepCountingPending{PendingLoginStore: mem.pending}
	s := NewServerWithStores(authConfig(t), &stores{sessions: sessions, pending: pending})

	s.sweepOnce(context.Background())
	if sessions.sweeps.Load() != 1 || pending.sweeps.Load() != 1 {
		t.Fatalf("sweeps: sessions %d, pending %d; want 1 each", sessions.sweeps.Load(), pending.sweeps.Load())
	}
}
