package main

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// rateWindow is the fixed window over which the per-IP request budgets apply.
const rateWindow = time.Minute

// rateLimiter is a minimal, dependency-free per-key fixed-window limiter, safe
// for concurrent use. Each key (client IP) gets `limit` events per `window`;
// once the budget is spent the key is rejected until the window rolls over. A
// non-positive limit disables the limiter (always allow).
type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	now    func() time.Time
	counts map[string]*counter
}

type counter struct {
	n     int
	reset time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		limit:  limit,
		window: window,
		now:    time.Now,
		counts: make(map[string]*counter),
	}
}

// allow records an event for key and reports whether it is within budget. When
// it is not, it returns the Retry-After duration until the window rolls over.
func (rl *rateLimiter) allow(key string) (bool, time.Duration) {
	if rl.limit <= 0 {
		return true, 0
	}
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()
	c, ok := rl.counts[key]
	if !ok || !now.Before(c.reset) {
		rl.counts[key] = &counter{n: 1, reset: now.Add(rl.window)}
		return true, 0
	}
	if c.n >= rl.limit {
		return false, c.reset.Sub(now)
	}
	c.n++
	return true, 0
}

// sweep drops windows that have already rolled over, bounding memory.
func (rl *rateLimiter) sweep() {
	if rl == nil {
		return
	}
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()
	for k, c := range rl.counts {
		if !now.Before(c.reset) {
			delete(rl.counts, k)
		}
	}
}

// clientIP returns the caller's IP for rate-limiting.
//
// The BFF is designed to sit behind Caddy on the same host: Caddy is the only
// public listener, connects over loopback, and (with its default
// trusted_proxies = none) REPLACES any client-supplied X-Forwarded-For with the
// real peer address. So the left-most X-Forwarded-For entry is trustworthy
// exactly when the TCP peer is loopback. P3-17: for any other peer — the BFF
// bound to a non-loopback address, or a test/dev setup with no proxy — the
// header is attacker-controlled and is ignored in favour of the peer address,
// otherwise a client could rotate keys freely and defeat the budgets.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			first := xff
			if i := strings.IndexByte(xff, ','); i >= 0 {
				first = xff[:i]
			}
			if fwd := strings.TrimSpace(first); fwd != "" && net.ParseIP(fwd) != nil {
				return fwd
			}
		}
	}
	return host
}

// rateLimited enforces rl against the request's client IP. When the budget is
// exceeded it writes a 429 with Retry-After and reports true so the caller
// returns without doing further work (never reaching the upstream).
func (s *Server) rateLimited(w http.ResponseWriter, r *http.Request, rl *rateLimiter) bool {
	if rl == nil {
		return false
	}
	ok, retry := rl.allow(clientIP(r))
	if ok {
		return false
	}
	secs := int(retry.Seconds())
	if secs < 1 {
		secs = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	writeJSON(w, map[string]any{"error": "rate_limited"}, http.StatusTooManyRequests)
	return true
}
