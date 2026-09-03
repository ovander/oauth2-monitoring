package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"path"
	"time"

	"github.com/ovander/backendkit/bff"
)

// adminPrefix is the only proxied path family. The BFF is an allowlist, never an
// open proxy: anything outside this prefix (and /bff/*) is 404.
const adminPrefix = "/api/admin/"

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
	store   SessionStore
	oauth   *oauthClient
	gateway *bff.Gateway
	login   bff.LoginBinding // ties /bff/login to the browser that must finish it at /bff/callback

	loginLimiter   *rateLimiter // per-IP budget for /bff/login
	elevateLimiter *rateLimiter // per-IP budget for /bff/elevate
}

// NewServer builds a Server with the default (in-memory) session store.
func NewServer(cfg *Config) *Server {
	return NewServerWithStore(cfg, nil)
}

// NewServerWithStore builds a Server with an explicit session store (e.g.
// Postgres). A nil store falls back to the in-memory store when auth is enabled.
func NewServerWithStore(cfg *Config, store SessionStore) *Server {
	proxy := bff.NewSingleHostProxy(cfg.adminURL)
	director := proxy.Director
	proxy.Director = func(r *http.Request) {
		director(r)
		r.Host = cfg.adminURL.Host
	}

	s := &Server{cfg: cfg, proxy: proxy}
	if cfg.AuthEnabled() {
		if store == nil {
			store = NewMemorySessionStore(cfg.SessionIdle, cfg.SessionAbsolute)
		}
		s.store = store
		s.oauth = newOAuthClient(cfg)
		s.login = bff.LoginBinding{Cookie: bff.CookieConfig{Name: "mon_login", Secure: cfg.CookieSecure}, TTL: 10 * time.Minute}
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
	return canonicalPathOnly(mux)
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

// sweepable is implemented by stores that prune expired rows in bulk.
type sweepable interface{ Sweep() }

// StartSweeper periodically prunes expired sessions/login-state and the per-IP
// rate-limiter windows until ctx is cancelled. It is a no-op only when there is
// nothing to sweep (Phase 1: no sweepable store and no limiters).
func (s *Server) StartSweeper(ctx context.Context) {
	sw, _ := s.store.(sweepable)
	if sw == nil && s.loginLimiter == nil && s.elevateLimiter == nil {
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
				if sw != nil {
					sw.Sweep()
				}
				if s.loginLimiter != nil {
					s.loginLimiter.sweep()
				}
				if s.elevateLimiter != nil {
					s.elevateLimiter.sweep()
				}
			}
		}
	}()
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// toucher is implemented by stores that can slide a session's idle window
// WITHOUT re-creating the row (P3-29). Put is an upsert: a /bff/session call
// racing a logout could Get the session just before Delete ran and then Put it
// straight back — resurrecting a session whose tokens were just revoked. Touch
// is an UPDATE that is a no-op once the row is gone.
type toucher interface {
	Touch(sess *bff.Session)
}

// sessionDeleter is implemented by stores that can report a failed Delete
// (P3-28). The shared bff.SessionStore.Delete has no error return; a logout
// whose server-side delete failed must not look like a clean logout.
type sessionDeleter interface {
	DeleteSession(id string) error
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
	if t, ok := s.store.(toucher); ok {
		t.Touch(sess)
	} else {
		s.store.Put(sess)
	}
	return sess
}

// deleteSession removes the session and reports a store failure when the
// store can surface one.
func (s *Server) deleteSession(id string) error {
	if d, ok := s.store.(sessionDeleter); ok {
		return d.DeleteSession(id)
	}
	s.store.Delete(id)
	return nil
}

func writeJSON(w http.ResponseWriter, v any, status ...int) {
	w.Header().Set("Content-Type", "application/json")
	if len(status) > 0 {
		w.WriteHeader(status[0])
	}
	_ = json.NewEncoder(w).Encode(v)
}
