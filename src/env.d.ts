/// <reference types="vite/client" />

// Build-time constants injected by Vite's define option (vite.config.ts).
// These are replaced with literal strings at build time — zero runtime cost.
declare const __APP_VERSION__:    string
declare const __APP_BUILD_DATE__: string
// Toolchain that built the console: Node.js (`process.version`, e.g. "v20.18.0")
// and Vite (e.g. "7.1.3").
declare const __APP_BUILD_NODE__: string
declare const __APP_BUILD_VITE__: string
