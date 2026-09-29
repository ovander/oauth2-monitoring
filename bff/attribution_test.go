package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// Client attribution: every call the BFF makes to Socrate for a browser, and
// every request it proxies, must tell Socrate who the browser is (the address
// clientIP resolved, and its User-Agent), and must never let the browser choose
// that address. Socrate trusts the LEFTMOST X-Forwarded-For entry from
// loopback, and the BFF reaches it over loopback.

const (
	attribUA       = "Mozilla/5.0 (X11; Linux x86_64) AttributionTest/1.0"
	attribForged   = "6.6.6.6"
	attribCaddyIP  = "203.0.113.7"    // the client address Caddy puts in X-Forwarded-For
	attribDirectIP = "198.51.100.9"   // a peer that reaches the BFF without Caddy
	attribLoopback = "127.0.0.1:5000" // Caddy's connection to the BFF
)

// seenHeaders records the attribution headers each upstream call carried,
// keyed by a short label ("token:refresh_token", "revoke:access_token",
// "admin:/api/admin/users", …).
type seenHeaders struct {
	mu sync.Mutex
	m  map[string]http.Header
}

func (s *seenHeaders) record(key string, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.m == nil {
		s.m = map[string]http.Header{}
	}
	s.m[key] = r.Header.Clone()
}

func (s *seenHeaders) get(t *testing.T, key string) http.Header {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	h, ok := s.m[key]
	if !ok {
		keys := make([]string, 0, len(s.m))
		for k := range s.m {
			keys = append(keys, k)
		}
		t.Fatalf("upstream never saw %q (saw %v)", key, keys)
	}
	return h
}

// attribHarness wires the BFF (Phase 2) against a mock issuer and a mock admin
// API that record the headers of every call.
func attribHarness(t *testing.T) (http.Handler, *Server, *seenHeaders) {
	t.Helper()
	seen := &seenHeaders{}
	access := makeJWT(map[string]any{"sub": "user-1", "roles": []any{"super_admin"}})
	elevated := makeJWT(map[string]any{"sub": "user-1", "exp": float64(time.Now().Add(5 * time.Minute).Unix())})

	issuer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/oauth/token":
			seen.record("token:"+r.Form.Get("grant_type"), r)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": access, "refresh_token": "refresh-2", "token_type": "Bearer", "expires_in": 300,
			})
		case "/oauth/revoke":
			seen.record("revoke:"+r.Form.Get("token_type_hint"), r)
		default:
			seen.record("issuer:"+r.URL.Path, r)
			_, _ = io.WriteString(w, `{"ok":true}`)
		}
	}))
	t.Cleanup(issuer.Close)

	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/admin/elevate" {
			seen.record("elevate", r)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": elevated, "expires_in": 300})
			return
		}
		seen.record("admin:"+r.URL.Path, r)
		_, _ = io.WriteString(w, "admin-ok")
	}))
	t.Cleanup(admin.Close)

	adminURL, _ := url.Parse(admin.URL)
	issuerURL, _ := url.Parse(issuer.URL)
	s := NewServer(&Config{
		AdminUpstream: admin.URL, adminURL: adminURL,
		OAuthUpstream: issuer.URL, oauthURL: issuerURL,
		OAuthPublicURL: "https://socrate.example", PublicOrigin: "https://mon.example",
		ClientID: "mon-client", ClientSecret: "secret", Scopes: "openid",
		SessionIdle: 30 * time.Minute, SessionAbsolute: 8 * time.Hour,
	})
	return s.Handler(), s, seen
}

// browserRequest is a request as the BFF receives it: from peer (Caddy on
// loopback, or a direct peer), with the browser's User-Agent, an optional
// X-Forwarded-For, and a forged X-Real-IP that must never reach Socrate.
func browserRequest(method, target, peer, xff string, body io.Reader) *http.Request {
	r := httptest.NewRequest(method, target, body)
	r.RemoteAddr = peer
	r.Header.Set("User-Agent", attribUA)
	r.Header.Set("X-Real-IP", attribForged)
	if xff != "" {
		r.Header.Set("X-Forwarded-For", xff)
	}
	return r
}

// attribSession stores a session whose access token is fresh, or within the
// refresh leeway when stale is set (so the next use refreshes it).
func attribSession(s *Server, stale bool) *http.Cookie {
	expiresIn := 300
	if stale {
		expiresIn = 5
	}
	sid := bff.RandomToken(16)
	ts := &socrate.TokenSet{AccessToken: "access-1", RefreshToken: "refresh-1", ExpiresIn: expiresIn}
	s.store.Put(bff.NewSession(sid, "csrf-1", ts, bff.UserInfo{Sub: "user-1"}, time.Now()))
	return &http.Cookie{Name: s.gateway.Cookie.CookieName(), Value: sid}
}

// wantAttributed asserts a call the BFF built itself carries exactly the
// attributed address (replaced, never appended) and the browser's User-Agent.
func wantAttributed(t *testing.T, label string, h http.Header, ip string) {
	t.Helper()
	if got := h.Values("X-Forwarded-For"); len(got) != 1 || got[0] != ip {
		t.Errorf("%s: X-Forwarded-For = %q, want exactly %q", label, got, ip)
	}
	if got := h.Get("X-Real-IP"); got != "" {
		t.Errorf("%s: X-Real-IP = %q, want none", label, got)
	}
	if got := h.Get("User-Agent"); got != attribUA {
		t.Errorf("%s: User-Agent = %q, want the browser's", label, got)
	}
}

// wantProxied asserts a proxied request names ip as the LEFTMOST
// X-Forwarded-For entry (the one Socrate uses), carries no forged value, and
// keeps the browser's User-Agent. httputil.ReverseProxy appends its own peer
// after the attributed address, so the full value is "ip, peer".
func wantProxied(t *testing.T, label string, h http.Header, ip, peerHost string) {
	t.Helper()
	xff := strings.Join(h.Values("X-Forwarded-For"), ", ")
	if want := ip + ", " + peerHost; xff != want {
		t.Errorf("%s: X-Forwarded-For = %q, want %q (Socrate reads the leftmost entry)", label, xff, want)
	}
	if strings.Contains(xff, attribForged) || h.Get("X-Real-IP") != "" {
		t.Errorf("%s: a browser-forged address reached Socrate: XFF=%q X-Real-IP=%q", label, xff, h.Get("X-Real-IP"))
	}
	if got := h.Get("User-Agent"); got != attribUA {
		t.Errorf("%s: User-Agent = %q, want the browser's", label, got)
	}
}

func TestAttribution_CodeExchange(t *testing.T) {
	for _, c := range []struct{ name, peer, xff, want string }{
		{"via Caddy", attribLoopback, attribCaddyIP, attribCaddyIP},
		{"direct peer forging XFF", attribDirectIP + ":4000", attribForged, attribDirectIP},
	} {
		t.Run(c.name, func(t *testing.T) {
			h, _, seen := attribHarness(t)
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, browserRequest(http.MethodGet, "/bff/login", c.peer, c.xff, nil))
			loc, _ := url.Parse(rr.Header().Get("Location"))
			binding := loginCookie(rr)
			if binding == nil {
				t.Fatal("no login-binding cookie")
			}

			rr = httptest.NewRecorder()
			req := browserRequest(http.MethodGet, "/bff/callback?code=abc&state="+loc.Query().Get("state"), c.peer, c.xff, nil)
			req.AddCookie(binding)
			h.ServeHTTP(rr, req)
			if rr.Code != http.StatusFound {
				t.Fatalf("callback = %d %s", rr.Code, rr.Body.String())
			}
			wantAttributed(t, "code exchange", seen.get(t, "token:authorization_code"), c.want)
		})
	}
}

func TestAttribution_RefreshOnProxiedCall(t *testing.T) {
	h, s, seen := attribHarness(t)
	req := browserRequest(http.MethodGet, "/api/admin/users", attribLoopback, attribCaddyIP, nil)
	req.AddCookie(attribSession(s, true))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("proxied call = %d %s", rr.Code, rr.Body.String())
	}
	wantAttributed(t, "refresh", seen.get(t, "token:refresh_token"), attribCaddyIP)
}

func TestAttribution_RefreshViaRefresherWithAttributedContext(t *testing.T) {
	_, s, seen := attribHarness(t)
	ctx := socrate.WithClientAttribution(t.Context(), socrate.ClientAttribution{IP: attribCaddyIP, UserAgent: attribUA})
	if _, err := (tokenRefresherAdapter{s.oauth}).RefreshToken(ctx, "refresh-1"); err != nil {
		t.Fatal(err)
	}
	wantAttributed(t, "refresher", seen.get(t, "token:refresh_token"), attribCaddyIP)
}

func TestAttribution_LogoutRevoke(t *testing.T) {
	h, s, seen := attribHarness(t)
	req := browserRequest(http.MethodPost, "/bff/logout", attribDirectIP+":4000", attribForged, nil)
	req.AddCookie(attribSession(s, false))
	req.Header.Set("X-CSRF-Token", "csrf-1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("logout = %d", rr.Code)
	}
	wantAttributed(t, "revoke refresh", seen.get(t, "revoke:refresh_token"), attribDirectIP)
	wantAttributed(t, "revoke access", seen.get(t, "revoke:access_token"), attribDirectIP)
}

func TestAttribution_StepUp(t *testing.T) {
	for _, c := range []struct{ name, peer, xff, want string }{
		{"via Caddy", attribLoopback, attribCaddyIP, attribCaddyIP},
		{"direct peer forging XFF", attribDirectIP + ":4000", attribForged, attribDirectIP},
	} {
		t.Run(c.name, func(t *testing.T) {
			h, s, seen := attribHarness(t)
			req := browserRequest(http.MethodPost, "/bff/elevate", c.peer, c.xff, strings.NewReader(`{"password":"pw"}`))
			req.AddCookie(attribSession(s, false))
			req.Header.Set("X-CSRF-Token", "csrf-1")
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != http.StatusNoContent {
				t.Fatalf("elevate = %d %s", rr.Code, rr.Body.String())
			}
			wantAttributed(t, "step-up", seen.get(t, "elevate"), c.want)
		})
	}
}

// Proxied requests: the admin API (whose admin actions Socrate audits, including
// the Server-Sent Events stream) and the public version probe on the issuer.
func TestAttribution_ProxiedRequests(t *testing.T) {
	routes := []struct {
		method, path, key string
		session           bool
	}{
		{http.MethodGet, "/api/admin/security/events", "admin:/api/admin/security/events", true},
		{http.MethodPost, "/api/admin/blocked-ips", "admin:/api/admin/blocked-ips", true},
		{http.MethodGet, "/api/admin/security/stream", "admin:/api/admin/security/stream", true},
		{http.MethodGet, "/api/version", "issuer:/api/version", false},
	}
	peers := []struct{ name, peer, xff, want, peerHost string }{
		{"via Caddy", attribLoopback, attribCaddyIP, attribCaddyIP, "127.0.0.1"},
		{"direct peer forging XFF", attribDirectIP + ":4000", attribForged, attribDirectIP, attribDirectIP},
		{"direct peer forging a chain", attribDirectIP + ":4000", attribForged + ", 10.0.0.1", attribDirectIP, attribDirectIP},
	}
	for _, p := range peers {
		for _, rt := range routes {
			t.Run(p.name+" "+rt.method+" "+rt.path, func(t *testing.T) {
				h, s, seen := attribHarness(t)
				req := browserRequest(rt.method, rt.path, p.peer, p.xff, strings.NewReader(`{}`))
				if rt.session {
					req.AddCookie(attribSession(s, false))
					req.Header.Set("X-CSRF-Token", "csrf-1")
				}
				rr := httptest.NewRecorder()
				h.ServeHTTP(rr, req)
				if rr.Code != http.StatusOK {
					t.Fatalf("%s %s = %d %s", rt.method, rt.path, rr.Code, rr.Body.String())
				}
				wantProxied(t, rt.path, seen.get(t, rt.key), p.want, p.peerHost)
			})
		}
	}
}
