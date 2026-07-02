package main

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// GET /bff/login — start Authorization Code + PKCE. Stores state + verifier
// server-side and redirects the browser to Socrate's authorize endpoint.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	state := randToken()
	verifier := randToken()
	s.store.PutLogin(state, loginState{
		Verifier: verifier,
		ReturnTo: sanitizeReturnTo(r.URL.Query().Get("return_to")),
		Created:  time.Now(),
	})
	http.Redirect(w, r, s.oauth.authorizeURL(state, pkceChallenge(verifier)), http.StatusFound)
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
	ls, ok := s.store.TakeLogin(state) // single-use; also guards CSRF on the callback
	if !ok || code == "" {
		http.Error(w, "invalid or expired login state", http.StatusBadRequest)
		return
	}

	tr, err := s.oauth.exchange(r.Context(), code, ls.Verifier)
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusBadGateway)
		return
	}

	now := time.Now()
	sess := &Session{
		ID:           randToken(),
		AccessToken:  tr.AccessToken,
		RefreshToken: tr.RefreshToken,
		IDToken:      tr.IDToken,
		AccessExpiry: now.Add(time.Duration(tr.ExpiresIn) * time.Second),
		User:         userFromToken(s.cfg.ClientID, tr),
		CSRF:         randToken(),
		Created:      now,
		LastSeen:     now,
	}
	s.store.Put(sess)
	s.setSessionCookie(w, sess.ID)
	http.Redirect(w, r, ls.ReturnTo, http.StatusFound)
}

// GET /bff/session — SPA bootstrap: who am I (and the CSRF token).
func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	sess := s.currentSession(w, r)
	if sess == nil {
		writeJSON(w, map[string]any{"authenticated": false})
		return
	}
	writeJSON(w, map[string]any{
		"authenticated": true,
		"user":          sess.snapshotUser(),
		"csrf":          sess.csrfToken(),
	})
}

// POST /bff/logout — best-effort revoke tokens upstream, destroy the session and
// clear the cookie. Mutating route, so it carries the same double-submit CSRF
// check as the other state-changing endpoints.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if sess := s.currentSession(w, r); sess != nil {
		if !s.checkCSRF(r, sess) {
			writeJSON(w, map[string]any{"error": "invalid_csrf"}, http.StatusForbidden)
			return
		}
		s.revokeSessionTokens(r.Context(), sess)
		s.store.Delete(sess.ID)
	}
	s.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// revokeSessionTokens best-effort revokes the session's refresh and access tokens
// at the issuer. Failures are logged and swallowed: logout must always clear the
// local session state regardless of the issuer's availability.
func (s *Server) revokeSessionTokens(ctx context.Context, sess *Session) {
	if s.oauth == nil {
		return
	}
	refresh, access := sess.tokens()
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
	sess := s.currentSession(w, r)
	if sess == nil {
		writeJSON(w, map[string]any{"error": "unauthenticated"}, http.StatusUnauthorized)
		return
	}
	if !s.checkCSRF(r, sess) {
		writeJSON(w, map[string]any{"error": "invalid_csrf"}, http.StatusForbidden)
		return
	}

	body, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
	endpoint := strings.TrimRight(s.cfg.AdminUpstream, "/") + "/api/admin/elevate"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		writeJSON(w, map[string]any{"error": "elevation_failed"}, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", sess.bearer())
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.oauth.http.Do(req)
	if err != nil {
		writeJSON(w, map[string]any{"error": "elevation_failed"}, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	// Forward Socrate's error (invalid credentials, mfa_required, …) to the SPA.
	if resp.StatusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(rb)
		return
	}

	var lr struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		IDToken      string `json:"id_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	_ = json.Unmarshal(rb, &lr)
	if lr.AccessToken != "" {
		expiry := sess.expiry()
		if lr.ExpiresIn > 0 {
			expiry = time.Now().Add(time.Duration(lr.ExpiresIn) * time.Second)
		}
		sess.applyTokens(lr.AccessToken, lr.RefreshToken, lr.IDToken, expiry)
		s.store.Put(sess)
	}
	w.WriteHeader(http.StatusNoContent)
}

// checkCSRF enforces the double-submit token on state-changing BFF endpoints.
// SameSite=Strict already blocks cross-site cookie attachment; this is
// defense-in-depth. Constant-time compare against the session's CSRF token.
func (s *Server) checkCSRF(r *http.Request, sess *Session) bool {
	got := r.Header.Get("X-CSRF-Token")
	csrf := sess.csrfToken()
	return got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(csrf)) == 1
}

func (s *Server) setSessionCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.SessionCookieName(),
		Value:    id,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.SessionCookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

// sanitizeReturnTo prevents open redirects: only same-site absolute paths are
// allowed; anything else falls back to "/". Backslashes are rejected because
// browsers normalize "/\evil.com" (and "\") into the protocol-relative
// "//evil.com"; control characters are rejected outright; and the target is
// parse-validated so its host must be empty.
func sanitizeReturnTo(p string) string {
	if p == "" || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") {
		return "/"
	}
	if strings.ContainsRune(p, '\\') {
		return "/"
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f {
			return "/"
		}
	}
	u, err := url.Parse(p)
	if err != nil || u.Scheme != "" || u.Host != "" {
		return "/"
	}
	return p
}
