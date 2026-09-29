package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// testVersionJSON is what the mock issuer answers on GET /api/version (the
// shape of Socrate's healthHandler.Version).
const testVersionJSON = `{"version":"1.3.0","commit":"abc1234","branch":"main","build_time":"2026-09-01T00:00:00Z"}`

// GET /api/version reaches the issuer upstream (BFF_OAUTH_UPSTREAM) and returns
// its JSON unchanged — the SPA's version badge and stale-tab check read it.
// It is public: no session is needed, and neither the session cookie nor any
// Authorization header, let alone the session's bearer, is forwarded.
func TestVersion_ProxiedToIssuerWithoutCredentials(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, _ := h.login(t)

	// Anonymous: no session, still served.
	anon := h.do(http.MethodGet, "/api/version", nil)
	if anon.Code != http.StatusOK {
		t.Fatalf("anonymous GET /api/version: got %d, want 200", anon.Code)
	}
	if got := anon.Body.String(); got != testVersionJSON {
		t.Fatalf("body: got %q, want the upstream JSON %q", got, testVersionJSON)
	}
	if ct := anon.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}

	// With a live session and a browser-supplied bearer: served, and nothing
	// credential-bearing reaches the upstream.
	req := httptest.NewRequest(http.MethodGet, "/api/version?t=123", nil)
	req.AddCookie(cookie)
	req.Header.Set("Authorization", "Bearer browser-supplied")
	rec := httptest.NewRecorder()
	h.srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != testVersionJSON {
		t.Fatalf("GET /api/version with session: got %d %q", rec.Code, rec.Body.String())
	}
	if h.versionCalls != 2 {
		t.Fatalf("issuer /api/version calls: got %d, want 2", h.versionCalls)
	}
	if h.versionAuth != "" {
		t.Errorf("Authorization forwarded to the public probe: %q", h.versionAuth)
	}
	if strings.Contains(h.versionAuth, h.accessToken) {
		t.Error("the session's access token reached the version upstream")
	}
	if h.versionCookie != "" {
		t.Errorf("Cookie (session id) forwarded to the public probe: %q", h.versionCookie)
	}
	if h.adminAuth != "" {
		t.Errorf("the version probe reached the admin API (saw Authorization %q)", h.adminAuth)
	}

	// The admin proxy is unchanged: same session, bearer injected.
	admin := h.do(http.MethodGet, "/api/admin/dashboard/stats", cookie)
	if admin.Code != http.StatusOK || h.adminAuth != "Bearer "+h.accessToken {
		t.Fatalf("admin proxy changed: status %d, Authorization %q", admin.Code, h.adminAuth)
	}
}

// HEAD is allowed with GET (http.ServeMux matches it on a GET pattern).
func TestVersion_HeadAllowed(t *testing.T) {
	h := newPhase2Harness(t)
	rec := h.do(http.MethodHead, "/api/version", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("HEAD /api/version: got %d, want 200", rec.Code)
	}
	if h.versionCalls != 1 || h.versionMethod != http.MethodHead {
		t.Fatalf("upstream: calls %d method %q, want 1 HEAD", h.versionCalls, h.versionMethod)
	}
}

// Every other method is refused before reaching any upstream, even with a
// valid session and CSRF token.
func TestVersion_OtherMethodsRefused(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, csrf := h.login(t)
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions} {
		req := httptest.NewRequest(m, "/api/version", strings.NewReader(`{}`))
		req.AddCookie(cookie)
		req.Header.Set("X-CSRF-Token", csrf)
		rec := httptest.NewRecorder()
		h.srv.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s /api/version: got %d, want 405", m, rec.Code)
		}
	}
	if h.versionCalls != 0 || h.adminAuth != "" {
		t.Fatalf("a refused method reached an upstream (version calls %d, admin Authorization %q)", h.versionCalls, h.adminAuth)
	}
}

// Exact path only: no prefix match, and non-canonical spellings are refused
// before routing, so none of them reaches the issuer or the admin API.
func TestVersion_NonCanonicalAndPrefixVariantsRefused(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, _ := h.login(t)
	for _, target := range []string{
		"/api/version/",
		"/api//version",
		"/api/./version",
		"/api/version/../admin/x",
		"/api/version/x",
		"/api/versionx",
		"/api/%76ersion",
		"/api/version%2f",
		"//api/version",
	} {
		rec := h.do(http.MethodGet, target, cookie)
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s: got %d, want 404", target, rec.Code)
		}
	}
	if h.versionCalls != 0 || h.adminAuth != "" {
		t.Fatalf("a refused path reached an upstream (version calls %d, admin Authorization %q)", h.versionCalls, h.adminAuth)
	}
}

// Phase 1 (no sessions) serves the probe too, with the browser's credentials
// dropped — unlike /api/admin/*, which passes them through in that mode.
func TestVersion_Phase1DropsBrowserCredentials(t *testing.T) {
	var gotAuth, gotCookie, gotPath string
	issuer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth, gotCookie = r.URL.Path, r.Header.Get("Authorization"), r.Header.Get("Cookie")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(testVersionJSON))
	}))
	defer issuer.Close()

	admin, _ := url.Parse("http://127.0.0.1:8081")
	ou, _ := url.Parse(issuer.URL)
	srv := NewServer(&Config{AdminUpstream: admin.String(), adminURL: admin, OAuthUpstream: issuer.URL, oauthURL: ou})

	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	req.Header.Set("Authorization", "Bearer browser-token")
	req.Header.Set("Cookie", "mon_session=x")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != testVersionJSON {
		t.Fatalf("Phase 1 GET /api/version: got %d %q", rec.Code, rec.Body.String())
	}
	if gotPath != "/api/version" || gotAuth != "" || gotCookie != "" {
		t.Fatalf("upstream saw path %q Authorization %q Cookie %q; want /api/version and no credentials", gotPath, gotAuth, gotCookie)
	}
}

// Without an issuer upstream (bare test configs) the route does not exist.
func TestVersion_NotRoutedWithoutIssuerUpstream(t *testing.T) {
	srv := testServer(t, "http://127.0.0.1:8081")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/version", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET /api/version without issuer upstream: got %d, want 404", rec.Code)
	}
}

// The issuer upstream is parsed in Phase 1 as well, since the probe uses it.
func TestLoadConfigPhase1ParsesIssuerUpstream(t *testing.T) {
	authEnv(t)
	t.Setenv("BFF_CLIENT_ID", "")
	t.Setenv("BFF_CLIENT_SECRET", "")
	t.Setenv("BFF_PHASE1_PASSTHROUGH", "true")
	t.Setenv("BFF_OAUTH_UPSTREAM", "")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.oauthURL == nil || cfg.oauthURL.Host != "127.0.0.1:8080" {
		t.Fatalf("oauthURL: got %v, want the default http://127.0.0.1:8080", cfg.oauthURL)
	}

	t.Setenv("BFF_OAUTH_UPSTREAM", "not-a-url")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for an invalid BFF_OAUTH_UPSTREAM in Phase 1")
	}
}
