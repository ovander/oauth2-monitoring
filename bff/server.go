package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"time"
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
	cfg   *Config
	proxy *httputil.ReverseProxy
	store SessionStore
	oauth *oauthClient
}

// NewServer builds a Server with the default (in-memory) session store.
func NewServer(cfg *Config) *Server {
	return NewServerWithStore(cfg, nil)
}

// NewServerWithStore builds a Server with an explicit session store (e.g.
// Postgres). A nil store falls back to the in-memory store when auth is enabled.
func NewServerWithStore(cfg *Config, store SessionStore) *Server {
	proxy := httputil.NewSingleHostReverseProxy(cfg.adminURL)
	proxy.FlushInterval = -1 // stream SSE immediately
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
	}
	return s
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/bff/healthz", s.health)
	mux.HandleFunc(adminPrefix, s.proxyAdmin)
	if s.cfg.AuthEnabled() {
		mux.HandleFunc("/bff/login", s.handleLogin)
		mux.HandleFunc("/bff/callback", s.handleCallback)
		mux.HandleFunc("/bff/session", s.handleSession)
		mux.HandleFunc("/bff/logout", s.handleLogout)
		mux.HandleFunc("/bff/elevate", s.handleElevate)
	}
	return mux
}

// sweepable is implemented by stores that prune expired rows in bulk.
type sweepable interface{ sweep() }

// StartSweeper periodically prunes expired sessions/login-state until ctx is
// cancelled. No-op for stores that don't implement sweep().
func (s *Server) StartSweeper(ctx context.Context) {
	sw, ok := s.store.(sweepable)
	if !ok {
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
				sw.sweep()
			}
		}
	}()
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// proxyAdmin forwards allowlisted admin-API calls to Socrate, injecting the
// session's access token when there is a session (Phase 2) and otherwise passing
// the request through unchanged (Phase 1 / pre-cookie SPA).
func (s *Server) proxyAdmin(w http.ResponseWriter, r *http.Request) {
	if s.cfg.AuthEnabled() && s.store != nil {
		if sess := s.currentSession(w, r); sess != nil {
			if err := s.ensureFresh(r.Context(), sess); err != nil {
				writeJSON(w, map[string]any{"error": "session expired"}, http.StatusUnauthorized)
				return
			}
			r.Header.Set("Authorization", "Bearer "+sess.AccessToken)
		}
	}
	s.proxy.ServeHTTP(w, r)
}

// ensureFresh proactively refreshes a session's access token shortly before it
// expires. A refresh failure is terminal for the request (the SPA re-logs in).
func (s *Server) ensureFresh(ctx context.Context, sess *Session) error {
	if sess.RefreshToken == "" || time.Until(sess.AccessExpiry) > 30*time.Second {
		return nil
	}
	tr, err := s.oauth.refresh(ctx, sess.RefreshToken)
	if err != nil {
		s.store.Delete(sess.ID)
		return err
	}
	sess.AccessToken = tr.AccessToken
	if tr.RefreshToken != "" {
		sess.RefreshToken = tr.RefreshToken
	}
	if tr.IDToken != "" {
		sess.IDToken = tr.IDToken
	}
	sess.AccessExpiry = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	s.store.Put(sess)
	return nil
}

func (s *Server) currentSession(_ http.ResponseWriter, r *http.Request) *Session {
	c, err := r.Cookie(s.cfg.SessionCookieName())
	if err != nil {
		return nil
	}
	sess, ok := s.store.Get(c.Value)
	if !ok {
		return nil
	}
	sess.LastSeen = time.Now() // sliding idle window
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
