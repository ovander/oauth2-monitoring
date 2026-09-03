package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// GET /bff/login — start Authorization Code + PKCE. Stores state + verifier
// server-side and redirects the browser to Socrate's authorize endpoint.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if s.rateLimited(w, r, s.loginLimiter) {
		return
	}
	state := bff.RandomToken(32)
	verifier := bff.RandomToken(32)
	// P3-15: bind the pending login to this browser. The callback must present
	// the nonce cookie issued here, so a captured callback URL cannot log a
	// different browser into the attacker's session.
	nonce := s.login.Begin(w)
	s.store.PutLogin(state, loginState{
		Verifier: verifier,
		ReturnTo: bff.SanitizeReturnTo(r.URL.Query().Get("return_to")),
		Nonce:    nonce,
		Created:  time.Now(),
	})
	http.Redirect(w, r, s.oauth.authorizeURL(state, bff.S256Challenge(verifier)), http.StatusFound)
}

// GET /bff/callback — validate state, exchange the code server-side, create the
// session, set the HttpOnly cookie, and redirect back into the SPA.
func (s *Server) handleCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		http.Error(w, "login failed: "+e, http.StatusBadRequest)
		return
	}
	state, code := q.Get("state"), q.Get("code")
	ls, ok := s.store.TakeLogin(state) // single-use: the callback is single-shot
	if !ok || code == "" {
		http.Error(w, "invalid or expired login state", http.StatusBadRequest)
		return
	}
	// The login-binding cookie proves this is the browser that started the
	// login (P3-15). Verify clears the cookie either way.
	if !s.login.Verify(w, r, ls.Nonce) {
		http.Error(w, "login was not started by this browser", http.StatusBadRequest)
		return
	}

	tr, err := s.oauth.exchange(r.Context(), code, ls.Verifier)
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusBadGateway)
		return
	}

	now := time.Now()
	ts := &socrate.TokenSet{
		AccessToken:  tr.AccessToken,
		RefreshToken: tr.RefreshToken,
		IDToken:      tr.IDToken,
		ExpiresIn:    tr.ExpiresIn,
	}
	sess := bff.NewSession(bff.RandomToken(32), bff.RandomToken(32), ts, userFromToken(s.cfg.ClientID, tr), now)
	s.store.Put(sess)
	s.gateway.Cookie.SetSession(w, sess.ID())
	http.Redirect(w, r, ls.ReturnTo, http.StatusFound)
}

// GET /bff/session — SPA bootstrap: who am I (and the CSRF token).
func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	// P3-20: the body carries the CSRF token and identity — never cacheable.
	w.Header().Set("Cache-Control", "no-store")
	sess := s.currentSession(w, r)
	if sess == nil {
		writeJSON(w, map[string]any{"authenticated": false})
		return
	}
	writeJSON(w, map[string]any{
		"authenticated": true,
		"user":          sess.User(),
		"csrf":          sess.CSRF(),
	})
}

// POST /bff/logout — best-effort revoke tokens upstream, destroy the session and
// clear the cookie. Mutating route, so it carries the same double-submit CSRF
// check as the other state-changing endpoints.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if sess := s.currentSession(w, r); sess != nil {
		if !sess.MatchCSRF(r.Header.Get(bff.DefaultCSRFHeader)) {
			writeJSON(w, map[string]any{"error": "invalid_csrf"}, http.StatusForbidden)
			return
		}
		s.revokeSessionTokens(r.Context(), sess)
		if err := s.deleteSession(sess.ID()); err != nil {
			// P3-28: the tokens were (best-effort) revoked upstream, but the
			// session row is still there. Clear the cookie so this browser is
			// out, and tell the SPA the logout did not fully complete rather
			// than pretending it did.
			log.Printf("bff: logout could not delete session: %v", err)
			s.gateway.Cookie.ClearSession(w)
			writeJSON(w, map[string]any{"error": "logout_incomplete"}, http.StatusInternalServerError)
			return
		}
	}
	s.gateway.Cookie.ClearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

// revokeSessionTokens best-effort revokes the session's refresh and access tokens
// at the issuer. Failures are logged and swallowed: logout must always clear the
// local session state regardless of the issuer's availability.
func (s *Server) revokeSessionTokens(ctx context.Context, sess *bff.Session) {
	if s.oauth == nil {
		return
	}
	refresh, access := sess.RefreshToken(), sess.AccessToken()
	if err := s.oauth.revoke(ctx, refresh, "refresh_token"); err != nil {
		log.Printf("bff: refresh-token revoke failed: %v", err)
	}
	if err := s.oauth.revoke(ctx, access, "access_token"); err != nil {
		log.Printf("bff: access-token revoke failed: %v", err)
	}
}

// POST /bff/elevate — Tier-0 step-up. The browser re-presents the password (and
// MFA, if enrolled); the BFF forwards it to Socrate's /api/admin/elevate using
// the session's current access token, and captures the returned fresh-auth_time
// access token into the session. No token is ever returned to the browser.
func (s *Server) handleElevate(w http.ResponseWriter, r *http.Request) {
	if s.rateLimited(w, r, s.elevateLimiter) {
		return
	}
	sess := s.currentSession(w, r)
	if sess == nil {
		writeJSON(w, map[string]any{"error": "unauthenticated"}, http.StatusUnauthorized)
		return
	}
	if !sess.MatchCSRF(r.Header.Get(bff.DefaultCSRFHeader)) {
		writeJSON(w, map[string]any{"error": "invalid_csrf"}, http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")

	// Make sure the session's access token is fresh before we use it against
	// the upstream elevate endpoint. Same policy as the shared proxy: only a
	// refresh the issuer REJECTS kills the session (and clears the cookie,
	// P2-16); a transient token-endpoint failure is a 502 the SPA can retry.
	if _, err := s.gateway.EnsureFresh(r.Context(), sess); err != nil {
		if bff.IsFatalRefreshError(err) {
			s.store.Delete(sess.ID())
			s.gateway.Cookie.ClearSession(w)
			writeJSON(w, map[string]any{"error": "session expired"}, http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]any{"error": "token_refresh_unavailable"}, http.StatusBadGateway)
		return
	}

	body, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
	endpoint := strings.TrimRight(s.cfg.AdminUpstream, "/") + "/api/admin/elevate"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		writeJSON(w, map[string]any{"error": "elevation_failed"}, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+sess.AccessToken())
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.oauth.http.Do(req)
	if err != nil {
		writeJSON(w, map[string]any{"error": "elevation_failed"}, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	// Forward Socrate's 4xx challenge (invalid credentials, mfa_required, …)
	// to the SPA so the step-up dialog can re-prompt. P3-21: anything else is
	// an upstream fault whose body (stack traces, proxy pages) must not reach
	// the browser.
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_, _ = w.Write(rb)
			return
		}
		log.Printf("bff: elevate upstream returned %d", resp.StatusCode)
		writeJSON(w, map[string]any{"error": "elevation_failed"}, http.StatusBadGateway)
		return
	}

	var lr struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		IDToken      string `json:"id_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(rb, &lr); err != nil || lr.AccessToken == "" || lr.ExpiresIn <= 0 {
		// A 200 without a usable token is not a successful step-up; do not
		// answer 204 (the SPA would retry the guarded action and get 403 again).
		log.Printf("bff: elevate upstream 200 without a usable access_token/expires_in")
		writeJSON(w, map[string]any{"error": "elevation_failed"}, http.StatusBadGateway)
		return
	}
	ts := &socrate.TokenSet{
		AccessToken:  lr.AccessToken,
		RefreshToken: lr.RefreshToken,
		IDToken:      lr.IDToken,
		ExpiresIn:    lr.ExpiresIn,
	}
	sess.SetTokens(ts, time.Now())
	s.store.Put(sess)
	w.WriteHeader(http.StatusNoContent)
}
