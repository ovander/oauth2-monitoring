package main

import (
	"fmt"
	"net/url"
	"os"
)

// Config holds the BFF's runtime configuration, sourced from the environment.
type Config struct {
	// ListenAddr is the address the BFF binds. It defaults to 127.0.0.1:8090 so
	// the service is reachable only via the Caddy edge on
	// monitoring.vandermoten.eu, never directly from the network.
	ListenAddr string

	// AdminUpstream is the internal base URL of the Socrate admin API. The BFF
	// talks to it over localhost (admin.vandermoten.eu is fronted by Caddy) to
	// avoid a public round-trip and to keep the admin control plane off the
	// browser-reachable network path.
	AdminUpstream string

	adminURL *url.URL
}

// LoadConfig reads configuration from the environment, applying safe defaults
// for the single-VPS topology (Caddy edge + colocated Socrate + Postgres).
func LoadConfig() (*Config, error) {
	c := &Config{
		ListenAddr:    getenv("BFF_LISTEN_ADDR", "127.0.0.1:8090"),
		AdminUpstream: getenv("BFF_ADMIN_UPSTREAM", "http://127.0.0.1:8081"),
	}

	u, err := url.Parse(c.AdminUpstream)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("invalid BFF_ADMIN_UPSTREAM %q", c.AdminUpstream)
	}
	c.adminURL = u
	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
