package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func makeJWT(claims map[string]any) string {
	enc := func(v any) string { b, _ := json.Marshal(v); return base64.RawURLEncoding.EncodeToString(b) }
	return enc(map[string]any{"alg": "none", "typ": "JWT"}) + "." + enc(claims) + ".sig"
}

// phase2Harness wires a Server with mock OAuth + admin upstreams.
type phase2Harness struct {
	srv           *Server
	adminAuth     string // Authorization header the admin (proxy) upstream last saw
	elevateAuth   string // Authorization header the elevate endpoint saw
	tokenForm     url.Values
	accessToken   string
	elevatedToken string
	elevateStatus int // status the mock elevate endpoint returns (default 200)
}

func newPhase2Harness(t *testing.T) *phase2Harness {
	t.Helper()
	h := &phase2Harness{
		accessToken:   makeJWT(map[string]any{"sub": "u1", "email": "a@b.c", "name": "Admin A"}),
		elevatedToken: makeJWT(map[string]any{"sub": "u1", "auth_time": 1}),
		elevateStatus: 200,
	}

	tokenSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		h.tokenForm = r.Form
		writeJSON(w, map[string]any{
			"access_token": h.accessToken, "refresh_token": "rt-1", "id_token": "id-1",
			"token_type": "Bearer", "expires_in": 3600,
			"roles": []string{"admin"}, "app_roles": map[string]string{"mon-client": "monitor_admin"},
		})
	}))
	t.Cleanup(tokenSrv.Close)

	adminSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/admin/elevate" {
			h.elevateAuth = r.Header.Get("Authorization")
			w.WriteHeader(h.elevateStatus)
			if h.elevateStatus == http.StatusOK {
				writeJSON(w, map[string]any{"access_token": h.elevatedToken, "token_type": "Bearer", "expires_in": 3600})
			} else {
				writeJSON(w, map[string]any{"error": "mfa_required"})
			}
			return
		}
		h.adminAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(adminSrv.Close)

	adminURL, _ := url.Parse(adminSrv.URL)
	cfg := &Config{
		AdminUpstream: adminSrv.URL, adminURL: adminURL,
		OAuthUpstream: tokenSrv.URL, OAuthPublicURL: "https://socrate.example",
		PublicOrigin: "https://mon.example",
		ClientID:     "mon-client", ClientSecret: "secret", Scopes: "openid profile email",
		SessionIdle: 30 * 60_000_000_000, SessionAbsolute: 8 * 3600_000_000_000,
		CookieSecure: false, // httptest is plain HTTP
	}
	ou, _ := url.Parse(cfg.OAuthUpstream)
	cfg.oauthURL = ou
	h.srv = NewServer(cfg)
	return h
}

func (h *phase2Harness) do(method, target string, cookie *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	h.srv.Handler().ServeHTTP(rec, req)
	return rec
}

func sessionCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == "mon_session" && c.Value != "" {
			return c
		}
	}
	return nil
}

// Full flow: login → callback → session → token-injected proxy → logout.
func TestPhase2_FullFlow(t *testing.T) {
	h := newPhase2Harness(t)

	// 1) login → 302 to authorize with PKCE + state.
	login := h.do(http.MethodGet, "/bff/login", nil)
	if login.Code != http.StatusFound {
		t.Fatalf("login: got %d, want 302", login.Code)
	}
	loc, _ := url.Parse(login.Header().Get("Location"))
	if !strings.HasPrefix(login.Header().Get("Location"), "https://socrate.example/oauth/authorize") {
		t.Fatalf("login redirect: %s", login.Header().Get("Location"))
	}
	q := loc.Query()
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		t.Fatalf("missing PKCE params: %v", q)
	}
	state := q.Get("state")
	if state == "" {
		t.Fatal("missing state")
	}

	// 2) callback → exchange, set cookie, redirect.
	cb := h.do(http.MethodGet, "/bff/callback?state="+state+"&code=authcode", nil)
	if cb.Code != http.StatusFound {
		t.Fatalf("callback: got %d, want 302 (body: %s)", cb.Code, cb.Body.String())
	}
	if h.tokenForm.Get("grant_type") != "authorization_code" || h.tokenForm.Get("code_verifier") == "" {
		t.Fatalf("token exchange form wrong: %v", h.tokenForm)
	}
	if h.tokenForm.Get("client_secret") != "secret" {
		t.Fatalf("client_secret not sent on exchange")
	}
	cookie := sessionCookie(cb)
	if cookie == nil {
		t.Fatal("no session cookie set")
	}
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("cookie attributes weak: %+v", cookie)
	}

	// 3) session → authenticated, roles merged from body + app_roles.
	sess := h.do(http.MethodGet, "/bff/session", cookie)
	var sb struct {
		Authenticated bool     `json:"authenticated"`
		User          UserInfo `json:"user"`
		CSRF          string   `json:"csrf"`
	}
	_ = json.Unmarshal(sess.Body.Bytes(), &sb)
	if !sb.Authenticated || sb.User.Sub != "u1" || sb.User.Email != "a@b.c" {
		t.Fatalf("session: %+v", sb)
	}
	if !hasRole(sb.User.Roles, "admin") || !hasRole(sb.User.Roles, "monitor_admin") {
		t.Fatalf("roles not merged: %v", sb.User.Roles)
	}
	if sb.CSRF == "" {
		t.Fatal("missing csrf")
	}

	// 4) proxy injects the session's access token (browser sent no Authorization).
	api := h.do(http.MethodGet, "/api/admin/dashboard/stats", cookie)
	if api.Code != http.StatusOK {
		t.Fatalf("proxy: got %d", api.Code)
	}
	if h.adminAuth != "Bearer "+h.accessToken {
		t.Fatalf("token not injected: %q", h.adminAuth)
	}

	// 5) logout → session gone.
	out := h.do(http.MethodPost, "/bff/logout", cookie)
	if out.Code != http.StatusNoContent {
		t.Fatalf("logout: got %d", out.Code)
	}
	after := h.do(http.MethodGet, "/bff/session", cookie)
	var ab struct {
		Authenticated bool `json:"authenticated"`
	}
	_ = json.Unmarshal(after.Body.Bytes(), &ab)
	if ab.Authenticated {
		t.Fatal("session still valid after logout")
	}
}

func TestPhase2_CallbackRejectsUnknownState(t *testing.T) {
	h := newPhase2Harness(t)
	cb := h.do(http.MethodGet, "/bff/callback?state=bogus&code=x", nil)
	if cb.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", cb.Code)
	}
}

// With auth enabled but no session cookie, the proxy passes the request through
// (dual mode) — the browser's own Authorization header is forwarded.
func TestPhase2_PassThroughWithoutSession(t *testing.T) {
	h := newPhase2Harness(t)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/x", nil)
	req.Header.Set("Authorization", "Bearer browser-token")
	rec := httptest.NewRecorder()
	h.srv.Handler().ServeHTTP(rec, req)
	if h.adminAuth != "Bearer browser-token" {
		t.Fatalf("pass-through failed: %q", h.adminAuth)
	}
}

func (h *phase2Harness) login(t *testing.T) (*http.Cookie, string) {
	t.Helper()
	login := h.do(http.MethodGet, "/bff/login", nil)
	loc, _ := url.Parse(login.Header().Get("Location"))
	cb := h.do(http.MethodGet, "/bff/callback?state="+loc.Query().Get("state")+"&code=c", nil)
	cookie := sessionCookie(cb)
	if cookie == nil {
		t.Fatal("login failed: no session cookie")
	}
	sess := h.do(http.MethodGet, "/bff/session", cookie)
	var sb struct {
		CSRF string `json:"csrf"`
	}
	_ = json.Unmarshal(sess.Body.Bytes(), &sb)
	return cookie, sb.CSRF
}

func (h *phase2Harness) post(target string, cookie *http.Cookie, csrf, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
	if cookie != nil {
		req.AddCookie(cookie)
	}
	if csrf != "" {
		req.Header.Set("X-CSRF-Token", csrf)
	}
	rec := httptest.NewRecorder()
	h.srv.Handler().ServeHTTP(rec, req)
	return rec
}

// Step-up: the BFF forwards the credentials with the SESSION's token and
// captures the fresh access token into the session (nothing to the browser).
func TestPhase2_Elevate_Success(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, csrf := h.login(t)

	rec := h.post("/bff/elevate", cookie, csrf, `{"password":"pw"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("elevate: got %d, want 204 (body: %s)", rec.Code, rec.Body.String())
	}
	if h.elevateAuth != "Bearer "+h.accessToken {
		t.Fatalf("elevate used the wrong token: %q", h.elevateAuth)
	}
	// The session now carries the elevated token: the proxy injects it.
	api := h.do(http.MethodGet, "/api/admin/x", cookie)
	if api.Code != http.StatusOK || h.adminAuth != "Bearer "+h.elevatedToken {
		t.Fatalf("session not upgraded to elevated token: %q", h.adminAuth)
	}
}

func TestPhase2_Elevate_RequiresCSRF(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, _ := h.login(t)
	rec := h.post("/bff/elevate", cookie, "", `{"password":"pw"}`) // no X-CSRF-Token
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

func TestPhase2_Elevate_RequiresSession(t *testing.T) {
	h := newPhase2Harness(t)
	rec := h.post("/bff/elevate", nil, "", `{"password":"pw"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestPhase2_Elevate_ForwardsSocrateError(t *testing.T) {
	h := newPhase2Harness(t)
	h.elevateStatus = http.StatusUnauthorized
	cookie, csrf := h.login(t)
	rec := h.post("/bff/elevate", cookie, csrf, `{"password":"bad"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "mfa_required") {
		t.Fatalf("Socrate error not forwarded: %s", rec.Body.String())
	}
}

// A session-backed mutation through the proxy requires a valid CSRF token;
// safe methods (GET) do not.
func TestPhase2_ProxyRequiresCSRFOnMutation(t *testing.T) {
	h := newPhase2Harness(t)
	cookie, csrf := h.login(t)

	// POST without X-CSRF-Token → 403, never reaches the upstream.
	h.adminAuth = ""
	no := h.post("/api/admin/security/blocked-ips", cookie, "", `{}`)
	if no.Code != http.StatusForbidden {
		t.Fatalf("mutation w/o CSRF: got %d, want 403", no.Code)
	}
	if h.adminAuth != "" {
		t.Fatal("request without CSRF should not reach the upstream")
	}

	// POST with the CSRF token → proxied, token injected.
	yes := h.post("/api/admin/security/blocked-ips", cookie, csrf, `{}`)
	if yes.Code != http.StatusOK {
		t.Fatalf("mutation w/ CSRF: got %d, want 200", yes.Code)
	}
	if h.adminAuth != "Bearer "+h.accessToken {
		t.Fatalf("token not injected: %q", h.adminAuth)
	}

	// A safe GET needs no CSRF token.
	get := h.do(http.MethodGet, "/api/admin/dashboard/stats", cookie)
	if get.Code != http.StatusOK {
		t.Fatalf("GET should not require CSRF: got %d", get.Code)
	}
}

func hasRole(roles []string, r string) bool {
	for _, x := range roles {
		if x == r {
			return true
		}
	}
	return false
}
