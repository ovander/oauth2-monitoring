package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterAllowsUpToLimitThenBlocks(t *testing.T) {
	rl := newRateLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if ok, _ := rl.allow("1.2.3.4"); !ok {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	ok, retry := rl.allow("1.2.3.4")
	if ok {
		t.Fatal("4th request should be blocked")
	}
	if retry <= 0 {
		t.Fatalf("blocked request should report a positive Retry-After, got %v", retry)
	}
}

func TestRateLimiterDisabledWhenNonPositive(t *testing.T) {
	rl := newRateLimiter(0, time.Minute)
	for i := 0; i < 100; i++ {
		if ok, _ := rl.allow("x"); !ok {
			t.Fatal("a non-positive limit must disable the limiter")
		}
	}
}

func TestRateLimiterKeysAreIndependent(t *testing.T) {
	rl := newRateLimiter(1, time.Minute)
	if ok, _ := rl.allow("a"); !ok {
		t.Fatal("first request for key a should be allowed")
	}
	if ok, _ := rl.allow("a"); ok {
		t.Fatal("second request for key a should be blocked")
	}
	if ok, _ := rl.allow("b"); !ok {
		t.Fatal("a different key must be unaffected")
	}
}

func TestRateLimiterWindowRollover(t *testing.T) {
	base := time.Now()
	now := base
	rl := newRateLimiter(1, time.Minute)
	rl.now = func() time.Time { return now }

	if ok, _ := rl.allow("k"); !ok {
		t.Fatal("first request should be allowed")
	}
	if ok, _ := rl.allow("k"); ok {
		t.Fatal("second request in-window should be blocked")
	}
	now = base.Add(61 * time.Second)
	if ok, _ := rl.allow("k"); !ok {
		t.Fatal("request after the window should be allowed again")
	}
}

func TestClientIPPrefersXForwardedFor(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "127.0.0.1:5555"
	r.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")
	if got := clientIP(r); got != "203.0.113.9" {
		t.Fatalf("clientIP = %q, want left-most XFF entry", got)
	}
	r2 := httptest.NewRequest(http.MethodGet, "/", nil)
	r2.RemoteAddr = "198.51.100.7:4444"
	if got := clientIP(r2); got != "198.51.100.7" {
		t.Fatalf("clientIP = %q, want RemoteAddr host when no XFF", got)
	}
}

// TestHandleLoginRateLimited drives the real /bff/login handler to prove the
// limiter is wired in: after the budget is spent the endpoint returns 429 with a
// Retry-After header instead of issuing another OAuth redirect.
func TestHandleLoginRateLimited(t *testing.T) {
	t.Setenv("BFF_CLIENT_ID", "cid")
	t.Setenv("BFF_CLIENT_SECRET", "s3cret")
	t.Setenv("BFF_OAUTH_PUBLIC_URL", "https://issuer.example")
	t.Setenv("BFF_PUBLIC_ORIGIN", "https://mon.example")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	s := NewServer(cfg)
	s.loginLimiter = newRateLimiter(2, time.Minute)

	do := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/bff/login", nil)
		req.RemoteAddr = "192.0.2.10:1111"
		rec := httptest.NewRecorder()
		s.handleLogin(rec, req)
		return rec
	}

	if rec := do(); rec.Code != http.StatusFound {
		t.Fatalf("request 1: want 302 redirect, got %d", rec.Code)
	}
	if rec := do(); rec.Code != http.StatusFound {
		t.Fatalf("request 2: want 302 redirect, got %d", rec.Code)
	}
	rec := do()
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("request 3: want 429, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("429 response must carry a Retry-After header")
	}
}
