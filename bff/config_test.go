package main

import (
	"strings"
	"testing"
)

// authEnv sets a minimal valid server-side-sessions environment; tests
// override single keys on top of it.
func authEnv(t *testing.T) {
	t.Helper()
	t.Setenv("BFF_LISTEN_ADDR", "")
	t.Setenv("BFF_ADMIN_UPSTREAM", "")
	t.Setenv("BFF_CLIENT_ID", "socrate-monitor")
	t.Setenv("BFF_CLIENT_SECRET", "s3cret")
	t.Setenv("BFF_OAUTH_PUBLIC_URL", "https://socrate.example")
	t.Setenv("BFF_PUBLIC_ORIGIN", "https://monitoring.example")
	t.Setenv("BFF_COOKIE_SECURE", "")
	t.Setenv("BFF_SESSION_IDLE", "")
	t.Setenv("BFF_SESSION_ABSOLUTE", "")
	t.Setenv("BFF_PHASE1_PASSTHROUGH", "")
	t.Setenv("BFF_ALLOW_PASSTHROUGH", "")
}

func TestLoadConfigAuthDefaults(t *testing.T) {
	authEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if !cfg.AuthEnabled() || !cfg.CookieSecure {
		t.Fatalf("unexpected: auth=%v secure=%v", cfg.AuthEnabled(), cfg.CookieSecure)
	}
	if w := cfg.Warnings(); len(w) != 0 {
		t.Errorf("clean config should carry no warnings, got %v", w)
	}
}

// P3-26 / pass-3 N-5: running without sessions must be an explicit choice.
func TestLoadConfigPhase1RequiresExplicitOptIn(t *testing.T) {
	authEnv(t)
	t.Setenv("BFF_CLIENT_ID", "")
	t.Setenv("BFF_CLIENT_SECRET", "")

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), "BFF_PHASE1_PASSTHROUGH") {
		t.Fatalf("Phase 1 without opt-in must fail mentioning BFF_PHASE1_PASSTHROUGH; got %v", err)
	}

	t.Setenv("BFF_PHASE1_PASSTHROUGH", "true")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("Phase 1 with opt-in: %v", err)
	}
	if cfg.AuthEnabled() {
		t.Error("AuthEnabled = true, want false when BFF_CLIENT_ID is empty")
	}
	if w := cfg.Warnings(); len(w) != 1 || !strings.Contains(w[0], "BFF_PHASE1_PASSTHROUGH") {
		t.Errorf("Phase 1 must be surfaced as a startup warning, got %v", w)
	}
}

func TestLoadConfigRejectsUnsafeCombinations(t *testing.T) {
	cases := []struct {
		name string
		key  string
		val  string
		want string
	}{
		{"insecure cookie on https origin", "BFF_COOKIE_SECURE", "false", "BFF_COOKIE_SECURE"},
		{"zero idle (expire-now on Postgres)", "BFF_SESSION_IDLE", "0s", "BFF_SESSION_IDLE"},
		{"negative absolute", "BFF_SESSION_ABSOLUTE", "-1h", "BFF_SESSION_ABSOLUTE"},
		{"missing client secret", "BFF_CLIENT_SECRET", "", "BFF_CLIENT_SECRET"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			authEnv(t)
			t.Setenv(c.key, c.val)
			_, err := LoadConfig()
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want error mentioning %s, got %v", c.want, err)
			}
		})
	}
}

func TestLoadConfigInsecureCookieAllowedForHTTPDevOrigin(t *testing.T) {
	authEnv(t)
	t.Setenv("BFF_PUBLIC_ORIGIN", "http://localhost:5173")
	t.Setenv("BFF_COOKIE_SECURE", "false")
	if _, err := LoadConfig(); err != nil {
		t.Fatalf("insecure cookie on an http dev origin must be allowed: %v", err)
	}
}

func TestLoadConfigAllowPassthroughIsWarned(t *testing.T) {
	authEnv(t)
	t.Setenv("BFF_ALLOW_PASSTHROUGH", "true")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if w := cfg.Warnings(); len(w) != 1 || !strings.Contains(w[0], "BFF_ALLOW_PASSTHROUGH") {
		t.Errorf("AllowPassthrough must be surfaced as a warning, got %v", w)
	}
}
