package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"time"

	"github.com/ovander/backendkit/bff"
)

// adminPrefix is the only proxied path family. The BFF is an allowlist, never an
// open proxy: anything outside this prefix, /bff/* and the exact versionRoute
// below is 404.
const adminPrefix = "/api/admin/"

// versionRoute is Socrate's public version probe, which the SPA reads for the
// server version badge and for stale-tab detection (useVersionCheck). It is an
// exact method+path pattern: GET (and HEAD, which http.ServeMux matches with a
// GET pattern) of "/api/version" only. Other methods get 405; "/api/version/"
// and any longer path match nothing and get 404.
const versionRoute = "GET /api/version"

// Server is the BFF HTTP handler.
//
//   - Phase 1 (BFF_CLIENT_ID unset): transparent, allowlisted reverse proxy; the
//     browser's bearer token is forwarded unchanged.
//   - Phase 2 (BFF_CLIENT_ID set): server-side OAuth — /bff/login|callback|
//     session|logout manage an HttpOnly-cookie session whose tokens live here;
//     the proxy injects the session's access token. With no session it falls back
//     to pass-through, so the server can deploy before the SPA switches to cookies.
type Server struct {
	cfg     *Config
	proxy   *httputil.ReverseProxy
	version *httputil.ReverseProxy // public /api/version probe → issuer; nil without an issuer upstream
	stores  *stores
	store   bff.SessionStore // == stores.sessions
	oauth   *oauthClient
	gateway *bff.Gateway
	login   bff.LoginBinding // ties /bff/login to the browser that must finish it at /bff/callback

	loginLimiter   *rateLimiter // per-IP budget for /bff/login
	elevateLimiter *rateLimiter // per-IP budget for /bff/elevate
}

// NewServer builds a Server with the default (in-memory) stores.
func NewServer(cfg *Config) *Server {
	return NewServerWithStores(cfg, nil)
}

// NewServerWithStores builds a Server with explicit stores (e.g. Postgres,
// from openStores). When auth is enabled, a nil st, or a nil field of it,
// falls back to the in-memory store.
func NewServerWithStores(cfg *Config, st *stores) *Server {
	proxy := bff.NewSingleHostProxy(cfg.adminURL)
	director := proxy.Director               //nolint:staticcheck // SA1019: wraps backendkit's Director-based NewSingleHostProxy; moving to Rewrite is a separate change
	proxy.Director = func(r *http.Request) { //nolint:staticcheck // SA1019: wraps backendkit's Director-based NewSingleHostProxy; moving to Rewrite is a separate change
		director(r)
		r.Host = cfg.adminURL.Host
	}

	s := &Server{cfg: cfg, proxy: attributedProxy(proxy)}
	if cfg.oauthURL != nil {
		s.version = newVersionProxy(cfg.oauthURL)
	}
	if cfg.AuthEnabled() {
		mem := newMemoryStores(cfg.SessionIdle, cfg.SessionAbsolute)
		if st == nil {
			st = mem
		}
		if st.sessions == nil {
			st.sessions = mem.sessions
		}
		if st.pending == nil {
			st.pending = mem.pending
		}
		s.stores, s.store = st, st.sessions
		s.oauth = newOAuthClient(cfg)
		// The binding cookie lives exactly as long as the pending login it
		// guards (bff.DefaultPendingLoginTTL == bff.DefaultLoginBindingTTL).
		s.login = bff.LoginBinding{Cookie: bff.CookieConfig{Name: "mon_login", Secure: cfg.CookieSecure}, TTL: bff.DefaultLoginBindingTTL}
		s.loginLimiter = newRateLimiter(cfg.LoginRate, rateWindow)
		s.elevateLimiter = newRateLimiter(cfg.ElevateRate, rateWindow)
		s.gateway = &bff.Gateway{
			Store: s.store,
			Cookie: bff.CookieConfig{
				Name:   "mon_session",
				Secure: cfg.CookieSecure,
				MaxAge: 0,
			},
			Refresher: tokenRefresherAdapter{s.oauth},
			// backendkit >= v1.11.0: the gateway is fail-closed by default
			// (DisableAuth zero value); only constructed when auth is enabled.
			AllowPassthrough: cfg.AllowPassthrough,
		}
	}
	return s
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/bff/healthz", s.health)
	if s.cfg.AuthEnabled() {
		mux.HandleFunc(adminPrefix, s.gateway.ProxyWithSession(s.proxy))
		mux.HandleFunc("/bff/login", s.handleLogin)
		mux.HandleFunc("/bff/callback", s.handleCallback)
		mux.HandleFunc("/bff/session", s.handleSession)
		mux.HandleFunc("/bff/logout", s.handleLogout)
		mux.HandleFunc("/bff/elevate", s.handleElevate)
	} else {
		mux.HandleFunc(adminPrefix, s.proxy.ServeHTTP)
	}
	// Public, unauthenticated, in both phases: it never goes through the
	// session gateway, so no session bearer can be attached to it.
	if s.version != nil {
		mux.Handle(versionRoute, s.version)
	}
	// Outermost: every Socrate call made for this request (login exchange,
	// refresh, revoke, step-up, proxied calls) is attributed to the browser.
	return withClientAttribution(canonicalPathOnly(mux))
}

// newVersionProxy builds the reverse proxy for the public GET /api/version
// probe.
//
// Upstream: the Socrate issuer listener (BFF_OAUTH_UPSTREAM, loopback :8080),
// not the admin API. Socrate serves the same handler on both listeners, but
// the issuer is the public one, where the probe is unauthenticated by design;
// it is also the upstream the admin console's BFF uses for this route, so both
// consoles report the same server version. The admin API stays reserved for
// session-authenticated /api/admin/* traffic.
//
// The probe needs no credentials, so the browser's Cookie (which carries the
// session id) and any Authorization header are dropped before the request
// leaves the BFF: nothing identifying a session reaches the upstream.
func newVersionProxy(upstream *url.URL) *httputil.ReverseProxy {
	p := bff.NewSingleHostProxy(upstream)
	director := p.Director               //nolint:staticcheck // SA1019: wraps backendkit's Director-based NewSingleHostProxy; moving to Rewrite is a separate change
	p.Director = func(r *http.Request) { //nolint:staticcheck // SA1019: wraps backendkit's Director-based NewSingleHostProxy; moving to Rewrite is a separate change
		director(r)
		r.Host = upstream.Host
		r.Header.Del("Authorization")
		r.Header.Del("Cookie")
	}
	return attributedProxy(p)
}

// canonicalPathOnly rejects any request whose path is not already in canonical
// form before it can reach an allowlist match (P3-18). http.ServeMux redirects
// a literal "/api/admin/../x", but a percent-encoded dot-segment
// ("/api/admin/%2e%2e/x") is matched on its escaped form, forwarded verbatim,
// and only normalised by the UPSTREAM — whose idea of the resulting path may
// differ from ours. Refusing non-canonical paths outright keeps the allowlist
// decision and the upstream's routing decision on the same string.
func canonicalPathOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		clean := path.Clean(p)
		// RawPath is only set when the request used a non-default encoding
		// (e.g. %2e for "."), which is never legitimate for these routes.
		if r.URL.RawPath != "" || (p != clean && p != clean+"/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// StartSweeper periodically prunes expired sessions, pending logins and the
// per-IP rate-limiter windows until ctx is cancelled. It is a no-op only when
// there is nothing to sweep (Phase 1: no stores and no limiters).
func (s *Server) StartSweeper(ctx context.Context) {
	if s.stores == nil && s.loginLimiter == nil && s.elevateLimiter == nil {
		return
	}
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.sweepOnce(ctx)
			}
		}
	}()
}

// sweepOnce is one tick of the sweeper.
func (s *Server) sweepOnce(ctx context.Context) {
	if s.stores != nil {
		s.stores.sweep(ctx)
	}
	if s.loginLimiter != nil {
		s.loginLimiter.sweep()
	}
	if s.elevateLimiter != nil {
		s.elevateLimiter.sweep()
	}
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// currentSession resolves the session referenced by the request's cookie and
// slides its idle-timeout window. Used by handlers outside the proxy path
// (which touches the session itself inside Gateway.ProxyWithSession).
func (s *Server) currentSession(_ http.ResponseWriter, r *http.Request) *bff.Session {
	sess, ok := s.gateway.SessionFromRequest(r)
	if !ok {
		return nil
	}
	sess.Touch(time.Now())
	s.writeBack(sess)
	return sess
}

// writeBack persists a change to an existing session (a slid idle window, a
// step-up token) without ever re-creating one that a racing logout deleted
// (P3-29): a /bff/session that read the session just before the logout's
// Delete must not put it straight back, with tokens that were just revoked.
//
//   - bff.MemoryStore hands out the very *Session it holds, so the change is
//     already in the store. Its Put is an unconditional insert, so it is
//     skipped: it could only re-insert a deleted session.
//   - bff.PostgresStore rehydrates a fresh *Session per Get, so the change
//     must be written. Its Put never re-creates a deleted session: Delete
//     leaves a tombstone (bff.PostgresStoreTombstoneTTL) and the upsert only
//     updates rows that are not tombstoned.
func (s *Server) writeBack(sess *bff.Session) {
	if _, inMemory := s.store.(*bff.MemoryStore); inMemory {
		return
	}
	s.store.Put(sess)
}

// deleteSession removes the session and reports a store failure (P3-28).
func (s *Server) deleteSession(id string) error {
	return s.stores.deleteSession(id)
}

func writeJSON(w http.ResponseWriter, v any, status ...int) {
	w.Header().Set("Content-Type", "application/json")
	if len(status) > 0 {
		w.WriteHeader(status[0])
	}
	_ = json.NewEncoder(w).Encode(v)
}
