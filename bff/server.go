package main

import (
	"net/http"
	"net/http/httputil"
)

// adminPrefix is the only path family the BFF proxies to Socrate. The BFF is an
// allowlist, never an open proxy: anything outside this prefix (and the BFF's
// own /bff/* routes) is 404.
const adminPrefix = "/api/admin/"

// Server is the BFF HTTP handler. Phase 1 is a transparent, allowlisted reverse
// proxy in front of the Socrate admin API; Phase 2 adds server-side sessions and
// token injection so the browser stops carrying tokens.
type Server struct {
	cfg   *Config
	proxy *httputil.ReverseProxy
}

// NewServer builds a Server that proxies allowlisted admin-API calls to the
// configured upstream.
func NewServer(cfg *Config) *Server {
	proxy := httputil.NewSingleHostReverseProxy(cfg.adminURL)

	// FlushInterval -1 streams responses immediately so Server-Sent Events
	// (/api/admin/events/stream) are not buffered by the proxy.
	proxy.FlushInterval = -1

	director := proxy.Director
	proxy.Director = func(r *http.Request) {
		director(r)
		// Present the upstream's host to Socrate.
		r.Host = cfg.adminURL.Host
	}

	return &Server{cfg: cfg, proxy: proxy}
}

// Handler returns the BFF's router.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/bff/healthz", s.health)
	mux.HandleFunc(adminPrefix, s.proxyAdmin)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// proxyAdmin forwards allowlisted admin-API calls to Socrate.
//
// Phase 1 is a transparent pass-through: the browser's Authorization header is
// forwarded unchanged, proving the proxy + SSE path with no behavior change.
// Phase 2 replaces this with a session lookup that injects the access token held
// server-side by the BFF, so the browser no longer carries any token.
func (s *Server) proxyAdmin(w http.ResponseWriter, r *http.Request) {
	s.proxy.ServeHTTP(w, r)
}
