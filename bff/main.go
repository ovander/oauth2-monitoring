// Command bff is the Backend-for-Frontend for the Socrate monitoring console.
//
// It runs as an internal service behind Caddy on monitoring.vandermoten.eu,
// holds OAuth token custody server-side (Authorization-Code + PKCE login, an
// opaque HttpOnly session cookie, session→bearer injection on the allowlisted
// admin-API proxy, SSE-aware) so the browser never sees a token.
//
// Running without server-side sessions (Phase 1 pass-through, BFF_CLIENT_ID
// unset) requires the explicit BFF_PHASE1_PASSTHROUGH=true opt-in and is
// meant only for a migration window.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("bff: config: %v", err)
	}
	for _, w := range cfg.Warnings() {
		log.Printf("bff: WARNING: %s", w)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Sessions and pending logins: Postgres when BFF_SESSION_DSN is set,
	// memory otherwise. A store that cannot be opened (database unreachable,
	// managed tables missing or not granted) stops the start-up: fail closed.
	var st *stores
	if cfg.AuthEnabled() {
		openCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		st, err = openStores(openCtx, cfg)
		cancel()
		if err != nil {
			log.Fatalf("bff: session store: %v", err)
		}
		defer func() { _ = st.Close() }()
		if cfg.SessionDSN != "" {
			log.Printf("bff: using the Postgres session store (schema: %s)", cfg.SessionSchema)
		}
	}

	srv := NewServerWithStores(cfg, st)
	srv.StartSweeper(ctx)

	httpServer := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("bff: listening on %s → admin upstream %s (auth=%t)", cfg.ListenAddr, cfg.AdminUpstream, cfg.AuthEnabled())
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("bff: listen: %v", err)
		}
	}()

	<-ctx.Done()

	log.Println("bff: shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("bff: shutdown: %v", err)
	}
}
