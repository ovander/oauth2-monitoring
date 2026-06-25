// Command bff is the Backend-for-Frontend for the Socrate monitoring console.
//
// Phase 1 (this build) runs as an internal service behind Caddy on
// monitoring.vandermoten.eu and reverse-proxies the admin API to Socrate,
// proving the proxy + SSE path. Later phases move OAuth token custody
// server-side so the browser holds only an HttpOnly session cookie.
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

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	srv := NewServer(cfg)
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
