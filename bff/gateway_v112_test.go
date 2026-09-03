package main

import (
	"net/http"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// expiredTokens is a token set that is already expired at any "now" the tests
// below apply it with (ExpiresIn 1s, applied a minute in the past).
func expiredTokens() *socrate.TokenSet {
	return &socrate.TokenSet{AccessToken: "expired-at", RefreshToken: "rt-1", ExpiresIn: 1}
}

// snapshotSessionStore has the same semantics as PostgresSessionStore — every
// Get rehydrates a fresh *bff.Session from a stored snapshot, so state that is
// not written back with Put is lost — without needing a database. Login state
// is delegated to the in-memory store.
type snapshotSessionStore struct {
	*MemorySessionStore
	mu   sync.Mutex
	rows map[string]bff.SessionSnapshot
}

func newSnapshotSessionStore() *snapshotSessionStore {
	return &snapshotSessionStore{
		MemorySessionStore: NewMemorySessionStore(time.Hour, time.Hour),
		rows:               map[string]bff.SessionSnapshot{},
	}
}

func (s *snapshotSessionStore) Get(id string) (*bff.Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, ok := s.rows[id]
	if !ok {
		return nil, false
	}
	return bff.NewSessionFromSnapshot(snap), true
}

func (s *snapshotSessionStore) Put(sess *bff.Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rows[sess.ID()] = sess.Snapshot()
}

func (s *snapshotSessionStore) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.rows, id)
}

func (s *snapshotSessionStore) row(id string) (bff.SessionSnapshot, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap, ok := s.rows[id]
	return snap, ok
}

// TestDurableStore_RefreshedTokensSurviveAcrossRequests is the consumer-level
// reproduction of P3-10: with a rehydrate-per-Get store and Socrate-style
// single-use rotating refresh tokens, a session must survive its first
// access-token expiry — the rotated refresh token has to be written back.
// Against backendkit < v1.12.0 the second request 401s and the session is
// deleted.
func TestDurableStore_RefreshedTokensSurviveAcrossRequests(t *testing.T) {
	store := newSnapshotSessionStore()
	h := newPhase2HarnessWithStore(t, store)
	h.expiresIn = 0 // every access token is born expired → refresh on first use

	cookie, _ := h.login(t)

	for i := 1; i <= 3; i++ {
		rec := h.do(http.MethodGet, "/api/admin/x", cookie)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d: got %d, want 200 (session died — spent refresh token re-used?)", i, rec.Code)
		}
	}
	if h.refreshCalls != 3 {
		// expires_in=0 means each request refreshes once; what matters is that
		// each refresh presented the PREVIOUS rotated token, never a spent one.
		t.Fatalf("want 3 refreshes (one per request, each with the rotated token), got %d", h.refreshCalls)
	}
	snap, ok := store.row(cookie.Value)
	if !ok {
		t.Fatal("session row vanished")
	}
	if snap.RefreshToken != "rt-4" {
		t.Fatalf("persisted refresh token = %q, want the latest rotated rt-4", snap.RefreshToken)
	}
}

// TestElevate_TransientRefreshFailureKeepsSession covers the P3-12 policy on
// the console's own EnsureFresh call site: a token-endpoint outage must not
// log the operator out.
func TestElevate_TransientRefreshFailureKeepsSession(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, csrf := h.login(t)

	// Force the session to need a refresh, then make the token endpoint 503.
	sess, _ := h.srv.store.Get(cookie.Value)
	sess.SetTokens(expiredTokens(), time.Now().Add(-time.Minute))
	h.srv.store.Put(sess)
	h.refreshStatus = http.StatusServiceUnavailable

	rec := h.post("/bff/elevate", cookie, csrf, `{"password":"pw"}`)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("transient refresh failure on elevate: got %d, want 502", rec.Code)
	}
	if _, ok := h.srv.store.Get(cookie.Value); !ok {
		t.Fatal("session must survive a transient refresh failure")
	}
}

// TestElevate_RejectedRefreshClearsSessionAndCookie covers the fatal branch and
// P2-16 (the cookie is now cleared on this path too).
func TestElevate_RejectedRefreshClearsSessionAndCookie(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, csrf := h.login(t)

	sess, _ := h.srv.store.Get(cookie.Value)
	sess.SetTokens(expiredTokens(), time.Now().Add(-time.Minute))
	h.srv.store.Put(sess)
	h.refreshStatus = http.StatusBadRequest // invalid_grant

	rec := h.post("/bff/elevate", cookie, csrf, `{"password":"pw"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("rejected refresh on elevate: got %d, want 401", rec.Code)
	}
	if _, ok := h.srv.store.Get(cookie.Value); ok {
		t.Fatal("session must be deleted on invalid_grant")
	}
	cleared := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == "mon_session" && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Fatal("P2-16: session cookie must be cleared when elevate tears the session down")
	}
}

// TestCallbackRequiresLoginBindingCookie: a callback URL captured from one
// browser must not complete the login in another (P3-15).
func TestCallbackRequiresLoginBindingCookie(t *testing.T) {
	h := newPhase2Harness(t)

	start := func() (string, *http.Cookie) {
		rec := h.do(http.MethodGet, "/bff/login", nil)
		loc, _ := url.Parse(rec.Header().Get("Location"))
		return loc.Query().Get("state"), loginCookie(rec)
	}

	// Browser B (no binding cookie) presents browser A's callback URL.
	stateA, _ := start()
	rec := h.do(http.MethodGet, "/bff/callback?state="+stateA+"&code=c", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("callback without binding cookie = %d, want 400", rec.Code)
	}
	if sessionCookie(rec) != nil {
		t.Fatal("a session cookie was minted for a browser that did not start the login")
	}

	// Browser B with its own login in flight presents browser A's URL.
	stateA2, _ := start()
	_, cookieB := start()
	rec = h.do(http.MethodGet, "/bff/callback?state="+stateA2+"&code=c", cookieB)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("callback with another browser's binding cookie = %d, want 400", rec.Code)
	}
}
