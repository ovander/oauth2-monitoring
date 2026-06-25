package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"
)

// Config holds the BFF's runtime configuration, sourced from the environment.
type Config struct {
	// ListenAddr is the address the BFF binds. Defaults to 127.0.0.1:8090 so the
	// service is reachable only via the Caddy edge, never directly from the network.
	ListenAddr string

	// AdminUpstream is the internal base URL of the Socrate admin API.
	AdminUpstream string
	adminURL      *url.URL

	// ── Phase 2: server-side OAuth (set ClientID to enable) ───────────────────

	// OAuthUpstream is the internal base URL of the Socrate OAuth server, used for
	// the back-channel token exchange/refresh (loopback, no public round-trip).
	OAuthUpstream string
	oauthURL      *url.URL

	// OAuthPublicURL is the public base URL of the Socrate OAuth server, used to
	// build the browser-facing /oauth/authorize redirect (e.g.
	// https://socrate.vandermoten.eu).
	OAuthPublicURL string

	// PublicOrigin is this console's public origin (e.g.
	// https://monitoring.vandermoten.eu). The OAuth redirect_uri is
	// PublicOrigin + /bff/callback.
	PublicOrigin string

	// ClientID / ClientSecret identify the BFF as a confidential OAuth client.
	// When ClientID is empty the BFF runs in Phase 1 mode (pass-through proxy,
	// no server-side sessions).
	ClientID     string
	ClientSecret string

	// Scopes requested at authorization (space-separated).
	Scopes string

	// Session lifetimes.
	SessionIdle     time.Duration
	SessionAbsolute time.Duration

	// SessionDSN, when set, selects the Postgres-backed session store (durable /
	// multi-instance). Empty uses the in-memory store (single instance).
	SessionDSN string

	// CookieSecure controls the Secure attribute (and the __Host- cookie name).
	// Default true; set false only for local HTTP development.
	CookieSecure bool
}

// AuthEnabled reports whether server-side OAuth / sessions are configured.
func (c *Config) AuthEnabled() bool { return c.ClientID != "" }

// SessionCookieName is __Host-prefixed when Secure (host-locked, Path=/, no
// Domain) and a plain name otherwise (so local HTTP dev still works).
func (c *Config) SessionCookieName() string {
	if c.CookieSecure {
		return "__Host-mon_session"
	}
	return "mon_session"
}

// RedirectURI is the registered callback for the BFF's OAuth client.
func (c *Config) RedirectURI() string {
	return strings.TrimRight(c.PublicOrigin, "/") + "/bff/callback"
}

// LoadConfig reads configuration from the environment with safe defaults.
func LoadConfig() (*Config, error) {
	c := &Config{
		ListenAddr:      getenv("BFF_LISTEN_ADDR", "127.0.0.1:8090"),
		AdminUpstream:   getenv("BFF_ADMIN_UPSTREAM", "http://127.0.0.1:8081"),
		OAuthUpstream:   getenv("BFF_OAUTH_UPSTREAM", "http://127.0.0.1:8080"),
		OAuthPublicURL:  getenv("BFF_OAUTH_PUBLIC_URL", ""),
		PublicOrigin:    getenv("BFF_PUBLIC_ORIGIN", ""),
		ClientID:        getenv("BFF_CLIENT_ID", ""),
		ClientSecret:    getenv("BFF_CLIENT_SECRET", ""),
		Scopes:          getenv("BFF_SCOPES", "openid profile email"),
		SessionIdle:     getdur("BFF_SESSION_IDLE", 30*time.Minute),
		SessionAbsolute: getdur("BFF_SESSION_ABSOLUTE", 8*time.Hour),
		SessionDSN:      getenv("BFF_SESSION_DSN", ""),
		CookieSecure:    getbool("BFF_COOKIE_SECURE", true),
	}

	u, err := url.Parse(c.AdminUpstream)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("invalid BFF_ADMIN_UPSTREAM %q", c.AdminUpstream)
	}
	c.adminURL = u

	if c.AuthEnabled() {
		ou, err := url.Parse(c.OAuthUpstream)
		if err != nil || ou.Scheme == "" || ou.Host == "" {
			return nil, fmt.Errorf("invalid BFF_OAUTH_UPSTREAM %q", c.OAuthUpstream)
		}
		c.oauthURL = ou
		if c.OAuthPublicURL == "" || c.PublicOrigin == "" {
			return nil, fmt.Errorf("BFF_OAUTH_PUBLIC_URL and BFF_PUBLIC_ORIGIN are required when BFF_CLIENT_ID is set")
		}
	}
	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getdur(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func getbool(key string, def bool) bool {
	switch strings.ToLower(os.Getenv(key)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}
