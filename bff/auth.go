package main

import (
	"net/http"
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
		"user":          sess.User,
		"csrf":          sess.CSRF,
	})
}

// POST /bff/logout — destroy the session and clear the cookie.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if sess := s.currentSession(w, r); sess != nil {
		s.store.Delete(sess.ID)
	}
	s.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
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
// allowed; anything else falls back to "/".
func sanitizeReturnTo(p string) string {
	if p == "" || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") {
		return "/"
	}
	return p
}
