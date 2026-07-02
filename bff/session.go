package main

import (
	"sync"
	"time"
)

// UserInfo is the subset of identity surfaced to the SPA via /bff/session.
type UserInfo struct {
	Sub   string   `json:"sub"`
	Email string   `json:"email,omitempty"`
	Name  string   `json:"name,omitempty"`
	Roles []string `json:"roles"`
}

// Session is the server-side record for an authenticated browser. The browser
// only ever holds the opaque session id (in an HttpOnly cookie); the tokens
// never leave the server.
type Session struct {
	// mu guards the mutable fields below. The in-memory store hands out the live
	// *Session pointer, so concurrent requests can read/mutate the same record;
	// every access after Get must hold this lock. It is unexported and therefore
	// ignored by the Postgres store's json (de)serialization.
	mu sync.Mutex

	ID           string
	AccessToken  string
	RefreshToken string
	IDToken      string
	AccessExpiry time.Time
	User         UserInfo
	CSRF         string
	Created      time.Time
	LastSeen     time.Time
}

// touch updates LastSeen (the sliding idle window) under the session lock.
func (s *Session) touch(now time.Time) {
	s.mu.Lock()
	s.LastSeen = now
	s.mu.Unlock()
}

// bearer returns the Authorization header value for the session's access token.
func (s *Session) bearer() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return "Bearer " + s.AccessToken
}

// csrfToken returns the session's CSRF token under the lock.
func (s *Session) csrfToken() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.CSRF
}

// snapshotUser returns a copy of the session's identity under the lock.
func (s *Session) snapshotUser() UserInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.User
}

// tokens returns the refresh and access tokens under the lock (for revocation).
func (s *Session) tokens() (refresh, access string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.RefreshToken, s.AccessToken
}

// expiry returns the access-token expiry under the lock.
func (s *Session) expiry() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.AccessExpiry
}

// refreshInfo returns the fields ensureFresh needs to decide on a refresh.
func (s *Session) refreshInfo() (refresh string, expiry time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.RefreshToken, s.AccessExpiry
}

// applyTokens atomically updates the session's tokens after a refresh or
// elevation. Empty refresh/id tokens are preserved (the issuer may omit them).
func (s *Session) applyTokens(access, refresh, id string, expiry time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.AccessToken = access
	if refresh != "" {
		s.RefreshToken = refresh
	}
	if id != "" {
		s.IDToken = id
	}
	s.AccessExpiry = expiry
}

// expired reports whether the session is past its idle or absolute lifetime.
// The time reads are guarded by the session lock (LastSeen is mutated by touch).
func (s *Session) expired(now time.Time, idle, absolute time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return now.Sub(s.Created) > absolute || now.Sub(s.LastSeen) > idle
}

// loginState holds the short-lived pre-authentication data for one in-flight
// Authorization-Code + PKCE login, keyed by the opaque state value.
type loginState struct {
	Verifier string
	ReturnTo string
	Created  time.Time
}

// SessionStore persists authenticated sessions and in-flight login state.
// The in-memory implementation is single-instance; a Postgres-backed impl is a
// drop-in replacement for HA/durability across restarts.
type SessionStore interface {
	PutLogin(state string, ls loginState)
	TakeLogin(state string) (loginState, bool) // single-use: removes on read
	Put(s *Session)
	Get(id string) (*Session, bool)
	Delete(id string)
}

// MemorySessionStore is a mutex-guarded in-memory SessionStore. Expiry is
// enforced lazily on read and by a background sweeper.
type MemorySessionStore struct {
	mu       sync.RWMutex
	logins   map[string]loginState
	sessions map[string]*Session

	idle     time.Duration
	absolute time.Duration
	loginTTL time.Duration
	now      func() time.Time
}

func NewMemorySessionStore(idle, absolute time.Duration) *MemorySessionStore {
	return &MemorySessionStore{
		logins:   make(map[string]loginState),
		sessions: make(map[string]*Session),
		idle:     idle,
		absolute: absolute,
		loginTTL: 10 * time.Minute,
		now:      time.Now,
	}
}

func (m *MemorySessionStore) PutLogin(state string, ls loginState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logins[state] = ls
}

func (m *MemorySessionStore) TakeLogin(state string) (loginState, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ls, ok := m.logins[state]
	if ok {
		delete(m.logins, state)
	}
	if ok && m.now().Sub(ls.Created) > m.loginTTL {
		return loginState{}, false
	}
	return ls, ok
}

func (m *MemorySessionStore) Put(s *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[s.ID] = s
}

func (m *MemorySessionStore) Get(id string) (*Session, bool) {
	m.mu.RLock()
	s, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return nil, false
	}
	if s.expired(m.now(), m.idle, m.absolute) {
		m.Delete(id)
		return nil, false
	}
	return s, true
}

func (m *MemorySessionStore) Delete(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
}

// sweep removes expired sessions and stale login state. Intended to run on a
// ticker for the process lifetime.
func (m *MemorySessionStore) sweep() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()
	for id, s := range m.sessions {
		if s.expired(now, m.idle, m.absolute) {
			delete(m.sessions, id)
		}
	}
	for st, ls := range m.logins {
		if now.Sub(ls.Created) > m.loginTTL {
			delete(m.logins, st)
		}
	}
}
