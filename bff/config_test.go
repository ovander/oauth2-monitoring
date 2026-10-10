package main

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
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
	t.Setenv("BFF_SESSION_DSN", "")
	t.Setenv("BFF_SESSION_KEY", "")
	t.Setenv("BFF_SESSION_SCHEMA", "")
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

// A 32-byte key in standard base64, as `openssl rand -base64 32` prints it.
var validSessionKey = base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0xA5}, 32))

func TestLoadConfigSessionStoreDefaults(t *testing.T) {
	authEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SessionDSN != "" || cfg.sessionKey != nil || cfg.SessionSchema != SessionSchemaManaged {
		t.Fatalf("defaults: dsn %q, key set %v, schema %q; want memory, no key, managed",
			cfg.SessionDSN, cfg.sessionKey != nil, cfg.SessionSchema)
	}
}

// With BFF_SESSION_DSN the encryption key is mandatory and must be exactly
// 32 bytes of standard base64: anything else refuses to start (fail closed),
// without echoing the value.
func TestLoadConfigSessionKey(t *testing.T) {
	const dsn = "postgres://bff@127.0.0.1:5432/bff"
	hexKey := hex.EncodeToString(bytes.Repeat([]byte{1}, 32))
	cases := []struct {
		name, key, want string
	}{
		{"missing", "", "BFF_SESSION_KEY is required"},
		{"not base64", "this is not base64!!", "not valid base64"},
		{"raw-url base64 is not accepted", base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{0xFB}, 32)), "not valid base64"},
		{"hex is not accepted", hexKey, "must decode to 32 bytes"},
		{"16 bytes", base64.StdEncoding.EncodeToString(make([]byte, 16)), "must decode to 32 bytes, got 16"},
		{"33 bytes", base64.StdEncoding.EncodeToString(make([]byte, 33)), "must decode to 32 bytes, got 33"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			authEnv(t)
			t.Setenv("BFF_SESSION_DSN", dsn)
			t.Setenv("BFF_SESSION_KEY", c.key)
			_, err := LoadConfig()
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want an error containing %q, got %v", c.want, err)
			}
			if c.key != "" && strings.Contains(err.Error(), c.key) {
				t.Fatal("the error echoes the key")
			}
		})
	}

	t.Run("valid", func(t *testing.T) {
		authEnv(t)
		t.Setenv("BFF_SESSION_DSN", dsn)
		t.Setenv("BFF_SESSION_KEY", " "+validSessionKey+"\n")
		cfg, err := LoadConfig()
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(cfg.sessionKey, bytes.Repeat([]byte{0xA5}, 32)) {
			t.Fatal("the decoded key is not the configured one")
		}
	})

	t.Run("ignored without a DSN", func(t *testing.T) {
		authEnv(t)
		t.Setenv("BFF_SESSION_KEY", "not base64")
		if _, err := LoadConfig(); err != nil {
			t.Fatalf("the memory store needs no key: %v", err)
		}
	})
}

func TestLoadConfigSessionSchema(t *testing.T) {
	for _, v := range []string{SessionSchemaManaged, SessionSchemaAuto} {
		t.Run(v, func(t *testing.T) {
			authEnv(t)
			t.Setenv("BFF_SESSION_DSN", "postgres://bff@127.0.0.1:5432/bff")
			t.Setenv("BFF_SESSION_KEY", validSessionKey)
			t.Setenv("BFF_SESSION_SCHEMA", v)
			cfg, err := LoadConfig()
			if err != nil || cfg.SessionSchema != v {
				t.Fatalf("schema %q: err %v", v, err)
			}
		})
	}
	for _, v := range []string{"Managed", "AUTO", "migrate", "none", " managed"} {
		t.Run("invalid "+v, func(t *testing.T) {
			authEnv(t)
			t.Setenv("BFF_SESSION_SCHEMA", v)
			if _, err := LoadConfig(); err == nil || !strings.Contains(err.Error(), "BFF_SESSION_SCHEMA") {
				t.Fatalf("schema %q: want a BFF_SESSION_SCHEMA error, got %v", v, err)
			}
		})
	}
}
