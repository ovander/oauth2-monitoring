package main

import (
	"sync"
	"time"

	"github.com/ovander/backendkit/bff"
)

// loginState holds the short-lived pre-authentication data for one in-flight
// Authorization-Code + PKCE login, keyed by the opaque state value.
type loginState struct {
	Verifier string
	ReturnTo string
	Created  time.Time
}

// SessionStore persists authenticated sessions (delegated to bff.SessionStore)
// and in-flight login state (app-specific, not part of the shared package).
type SessionStore interface {
	bff.SessionStore
	PutLogin(state string, ls loginState)
	TakeLogin(state string) (loginState, bool) // single-use: removes on read
}

// MemorySessionStore composes bff's tested in-memory session store with a
// small in-memory login-state map. Login state has its own TTL/sweep
// (separate from session idle/absolute expiry).
type MemorySessionStore struct {
	*bff.MemoryStore
	mu       sync.Mutex
	logins   map[string]loginState
	loginTTL time.Duration
	now      func() time.Time
}

func NewMemorySessionStore(idle, absolute time.Duration) *MemorySessionStore {
	return &MemorySessionStore{
		MemoryStore: bff.NewMemoryStore(idle, absolute),
		logins:      make(map[string]loginState),
		loginTTL:    10 * time.Minute,
		now:         time.Now,
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

// Sweep prunes expired sessions (via the embedded bff.MemoryStore.Sweep) and
// stale login state. It shadows the promoted bff.MemoryStore.Sweep so callers
// going through the SessionStore interface get both behaviors.
func (m *MemorySessionStore) Sweep() {
	m.MemoryStore.Sweep()
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()
	for st, ls := range m.logins {
		if now.Sub(ls.Created) > m.loginTTL {
			delete(m.logins, st)
		}
	}
}
