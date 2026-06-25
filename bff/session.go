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
	now := m.now()
	if now.Sub(s.Created) > m.absolute || now.Sub(s.LastSeen) > m.idle {
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
		if now.Sub(s.Created) > m.absolute || now.Sub(s.LastSeen) > m.idle {
			delete(m.sessions, id)
		}
	}
	for st, ls := range m.logins {
		if now.Sub(ls.Created) > m.loginTTL {
			delete(m.logins, st)
		}
	}
}
