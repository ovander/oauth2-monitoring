package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func testServer(t *testing.T, upstream string) *Server {
	t.Helper()
	u, err := url.Parse(upstream)
	if err != nil {
		t.Fatalf("parse upstream: %v", err)
	}
	return NewServer(&Config{ListenAddr: "127.0.0.1:0", AdminUpstream: upstream, adminURL: u})
}

func TestHealthz(t *testing.T) {
	srv := testServer(t, "http://127.0.0.1:8081")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/bff/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("healthz: got %d, want 200", rec.Code)
	}
}

// Phase 1 is a transparent pass-through: the allowlisted admin path reaches the
// upstream and the browser's Authorization header is forwarded unchanged.
func TestProxyForwardsAdminWithAuthHeader(t *testing.T) {
	var gotPath, gotAuth string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer backend.Close()

	srv := testServer(t, backend.URL)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/dashboard/stats", nil)
	req.Header.Set("Authorization", "Bearer abc123")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("proxy: got %d, want 200", rec.Code)
	}
	if gotPath != "/api/admin/dashboard/stats" {
		t.Errorf("upstream path: got %q, want /api/admin/dashboard/stats", gotPath)
	}
	if gotAuth != "Bearer abc123" {
		t.Errorf("authorization not forwarded: got %q", gotAuth)
	}
}

// The BFF is an allowlist: only /bff/* and /api/admin/* are served. Everything
// else — including other Socrate API families — must 404, never proxy.
func TestNonAllowlistedPathIs404(t *testing.T) {
	srv := testServer(t, "http://127.0.0.1:8081")
	for _, p := range []string{"/secret", "/api/oauth/token", "/api/profile", "/"} {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("path %q: got %d, want 404", p, rec.Code)
		}
	}
}

func TestLoadConfigRejectsBadUpstream(t *testing.T) {
	t.Setenv("BFF_ADMIN_UPSTREAM", "not-a-url")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected error for invalid upstream, got nil")
	}
}
