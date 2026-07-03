package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httputil"
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
		s.loginLimiter = newRateLimiter(cfg.LoginRate, rateWindow)
		s.elevateLimiter = newRateLimiter(cfg.ElevateRate, rateWindow)
		s.gateway = &bff.Gateway{
			Store: s.store,
			Cookie: bff.CookieConfig{
				Name:   "mon_session",
				Secure: cfg.CookieSecure,
				MaxAge: 0,
			},
			Refresher:        tokenRefresherAdapter{s.oauth},
			AuthEnabled:      true,
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
	return mux
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

// currentSession resolves the session referenced by the request's cookie and
// slides its idle-timeout window. Used by handlers outside the proxy path
// (which touches the session itself inside Gateway.ProxyWithSession).
func (s *Server) currentSession(_ http.ResponseWriter, r *http.Request) *bff.Session {
	sess, ok := s.gateway.SessionFromRequest(r)
	if !ok {
		return nil
	}
	sess.Touch(time.Now())
	s.store.Put(sess)
	return sess
}

func writeJSON(w http.ResponseWriter, v any, status ...int) {
	w.Header().Set("Content-Type", "application/json")
	if len(status) > 0 {
		w.WriteHeader(status[0])
	}
	_ = json.NewEncoder(w).Encode(v)
}
