package main

// attribution.go — tell Socrate which browser a call is made for.
//
// The BFF reaches Socrate over loopback, and Socrate trusts the LEFTMOST
// X-Forwarded-For entry from loopback. Without attribution, the token, revoke
// and step-up calls the BFF makes itself are audited and rate-limited as the
// BFF (127.0.0.1, Go-http-client), and a proxied request keeps whatever
// X-Forwarded-For the peer sent, so a peer that reaches the BFF without Caddy
// could choose its own logged address. Both are fixed here with one rule: the
// only address the BFF ever forwards is the one clientIP resolved.

import (
	"net/http"
	"net/http/httputil"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// withClientAttribution is the outermost middleware. It records, in the
// request context, the browser's address as clientIP resolves it (the
// left-most X-Forwarded-For only from a loopback peer, i.e. Caddy; the peer
// address otherwise) and its User-Agent. Every outgoing Socrate call made for
// this request reads it through socrate.ApplyClientAttribution.
func withClientAttribution(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, bff.WithClientAttribution(r, clientIP(r)))
	})
}

// attributedProxy makes p forward the resolved client address instead of the
// peer's X-Forwarded-For. After the existing Director runs, it drops any
// inbound X-Forwarded-For and sets it to the attributed address alone;
// httputil.ReverseProxy then appends the BFF's own peer, so Socrate receives
// "client, peer" and reads the client. Without attribution in the context
// (which withClientAttribution always sets) the header is still dropped, so a
// browser-supplied value can never be left-most.
func attributedProxy(p *httputil.ReverseProxy) *httputil.ReverseProxy {
	director := p.Director               //nolint:staticcheck // SA1019: wraps backendkit's Director-based NewSingleHostProxy; moving to Rewrite is a separate change
	p.Director = func(r *http.Request) { //nolint:staticcheck // SA1019: wraps backendkit's Director-based NewSingleHostProxy; moving to Rewrite is a separate change
		director(r)
		r.Header.Del("X-Forwarded-For")
		socrate.ApplyClientAttribution(r)
	}
	return p
}
