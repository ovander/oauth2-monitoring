package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ovander/backendkit/bff"
)

// Pass-3 Low/Info hardening: P3-17, P3-18, P3-20, P3-21, P3-28, P3-29.

// ── P3-17: X-Forwarded-For is only trusted from a loopback peer ──────────────

func TestClientIP_HonoursXFFOnlyFromLoopback(t *testing.T) {
	cases := []struct{ remote, xff, want string }{
		{"127.0.0.1:1234", "203.0.113.9, 127.0.0.1", "203.0.113.9"}, // Caddy on the same host
		{"[::1]:1234", "203.0.113.9", "203.0.113.9"},
		{"127.0.0.1:1234", "", "127.0.0.1"},
		{"127.0.0.1:1234", "not-an-ip", "127.0.0.1"},
		{"198.51.100.4:1234", "203.0.113.9", "198.51.100.4"}, // non-loopback peer: header ignored
		{"198.51.100.4:1234", "", "198.51.100.4"},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if got := clientIP(r); got != c.want {
			t.Errorf("remote=%s xff=%q: clientIP = %q, want %q", c.remote, c.xff, got, c.want)
		}
	}
}

func TestRateLimit_CannotBeRotatedViaXFFFromNonLoopbackPeer(t *testing.T) {
	s := &Server{}
	rl := newRateLimiter(2, time.Minute)
	for i := 0; i < 5; i++ {
		rr := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/bff/login", nil)
		r.RemoteAddr = "198.51.100.4:4000"
		r.Header.Set("X-Forwarded-For", "10.0.0."+string(rune('1'+i))) // a fresh spoofed key each time
		limited := s.rateLimited(rr, r, rl)
		if i < 2 && limited {
			t.Fatalf("request %d limited too early", i)
		}
		if i >= 2 && !limited {
			t.Fatalf("request %d not limited: spoofed X-Forwarded-For rotated the key", i)
		}
	}
}

// ── P3-18: non-canonical paths never reach an upstream ───────────────────────

func TestEncodedDotSegmentsAreRejected(t *testing.T) {
	var mu sync.Mutex
	var reached []string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		reached = append(reached, r.URL.EscapedPath())
		mu.Unlock()
	}))
	defer backend.Close()

	h := testServer(t, backend.URL).Handler()
	for _, target := range []string{
		"/api/admin/%2e%2e/secret",
		"/api/admin/%2E%2E/secret",
		"/api/admin/users/%2e%2e/%2e%2e/secret",
		"/api/admin//users",
		"/api/admin/./users",
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, target, nil))
		if rr.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", target, rr.Code)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if len(reached) != 0 {
		t.Fatalf("non-canonical paths reached the upstream: %v", reached)
	}
}

func TestCanonicalPathsStillProxy(t *testing.T) {
	var got string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.URL.Path
	}))
	defer backend.Close()
	h := testServer(t, backend.URL).Handler()
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/security/events?ip=%20x", nil))
	if rr.Code != http.StatusOK || got != "/api/admin/security/events" {
		t.Fatalf("status %d upstream path %q", rr.Code, got)
	}
}

// ── P3-20: /bff/session is no-store ──────────────────────────────────────────

func TestSessionEndpointIsNoStore(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, _ := h.login(t)
	for _, c := range []*http.Cookie{cookie, nil} {
		rec := h.do(http.MethodGet, "/bff/session", c)
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("cookie=%v: Cache-Control = %q, want no-store", c != nil, got)
		}
	}
}

// ── P3-21: elevate forwards only 4xx; a 200 without a token is not a success ─

func TestElevate_Upstream5xxIsNotForwarded(t *testing.T) {
	h := newPhase2Harness(t)
	h.elevateStatus = http.StatusInternalServerError // harness body: {"error":"mfa_required"} — must NOT be forwarded
	cookie, csrf := h.login(t)
	rec := h.post("/bff/elevate", cookie, csrf, `{"password":"pw"}`)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "mfa_required") {
		t.Fatalf("upstream 5xx body forwarded to the browser: %s", rec.Body.String())
	}
}

func TestElevate_200WithoutTokenFailsClosed(t *testing.T) {
	h := newPhase2Harness(t)
	h.elevatedToken = "" // upstream answers 200 {"access_token":""}
	cookie, csrf := h.login(t)
	rec := h.post("/bff/elevate", cookie, csrf, `{"password":"pw"}`)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", rec.Code)
	}
	// The session still injects the ORIGINAL token.
	api := h.do(http.MethodGet, "/api/admin/x", cookie)
	if api.Code != http.StatusOK || h.adminAuth != "Bearer "+h.accessToken {
		t.Fatalf("session token changed after a failed elevation: %q", h.adminAuth)
	}
}

// ── P3-29: /bff/session must Touch, never Put (no resurrection after logout) ─

// touchSpyStore wraps the memory store and records which write path the
// handlers use for the idle-window slide.
type touchSpyStore struct {
	*MemorySessionStore
	mu      sync.Mutex
	puts    int
	touches int
}

func (s *touchSpyStore) Put(sess *bff.Session) {
	s.mu.Lock()
	s.puts++
	s.mu.Unlock()
	s.MemorySessionStore.Put(sess)
}

func (s *touchSpyStore) Touch(sess *bff.Session) {
	s.mu.Lock()
	s.touches++
	s.mu.Unlock()
	s.MemorySessionStore.Touch(sess)
}

func TestSessionEndpointTouchesInsteadOfPut(t *testing.T) {
	store := &touchSpyStore{MemorySessionStore: NewMemorySessionStore(30*time.Minute, 8*time.Hour)}
	h := newPhase2HarnessWithStore(t, store)
	cookie, _ := h.login(t) // callback Put + one /bff/session inside login()

	store.mu.Lock()
	putsAfterLogin := store.puts
	store.mu.Unlock()

	for i := 0; i < 3; i++ {
		if rec := h.do(http.MethodGet, "/bff/session", cookie); rec.Code != http.StatusOK {
			t.Fatalf("session = %d", rec.Code)
		}
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.puts != putsAfterLogin {
		t.Fatalf("/bff/session used Put (upsert) %d times; must use Touch", store.puts-putsAfterLogin)
	}
	if store.touches < 3 {
		t.Fatalf("touches = %d, want >= 3", store.touches)
	}
}

func TestMemoryTouchDoesNotResurrectDeletedSession(t *testing.T) {
	store := NewMemorySessionStore(30*time.Minute, 8*time.Hour)
	sess := bff.NewSession("sid", "csrf", nil, bff.UserInfo{Sub: "u1"}, time.Now())
	store.Put(sess)
	store.Delete("sid")
	sess.Touch(time.Now())
	store.Touch(sess)
	if _, ok := store.Get("sid"); ok {
		t.Fatal("Touch re-created a deleted session")
	}
}

// ── P3-28: a failed server-side delete is not reported as a clean logout ─────

type failingDeleteStore struct {
	*MemorySessionStore
}

func (s *failingDeleteStore) DeleteSession(string) error {
	return errFailedDelete
}

var errFailedDelete = &storeError{"connection refused"}

type storeError struct{ msg string }

func (e *storeError) Error() string { return e.msg }

func TestLogoutSurfacesDeleteFailure(t *testing.T) {
	store := &failingDeleteStore{MemorySessionStore: NewMemorySessionStore(30*time.Minute, 8*time.Hour)}
	h := newPhase2HarnessWithStore(t, store)
	cookie, csrf := h.login(t)

	rec := h.post("/bff/logout", cookie, csrf, "")
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), "logout_incomplete") {
		t.Fatalf("logout with a failing delete = %d %q, want 500 logout_incomplete", rec.Code, rec.Body.String())
	}
	// The browser is still logged out locally (cookie cleared) and the
	// tokens were revoked upstream before the delete was attempted.
	if c := sessionCookie(rec); c != nil {
		t.Fatalf("session cookie re-issued on failed logout")
	}
	if len(h.revoked) == 0 {
		t.Fatal("tokens not revoked before the delete")
	}
}
