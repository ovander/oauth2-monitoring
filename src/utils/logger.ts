/**
 * Centralised logger built on loglevel.
 *
 * Log levels (lowest → highest priority):
 *   trace | debug | info | warn | error | silent
 *
 * In development  → level is DEBUG  (everything shows)
 * In production   → level is WARN   (only warnings and errors)
 *
 * Per-module loggers are created with `useLogger(name)` so you can filter by
 * prefix in DevTools:  Ctrl+L then type "[auth]" to see only auth messages.
 *
 * Override the root level at runtime from the browser console:
 *   window.__setLogLevel('debug')   // verbose
 *   window.__setLogLevel('silent')  // nothing
 * The override lasts until the page reloads: levels are never persisted, since
 * the SPA keeps nothing in localStorage or sessionStorage (SECURITY.md).
 * loglevel persists by default, so every setLevel passes `persist = false`.
 */

import log from 'loglevel'
import type { Logger } from 'loglevel'

// ─── Root level ──────────────────────────────────────────────────────────────

const ROOT_LEVEL = import.meta.env.DEV ? 'debug' : 'warn'

// Earlier builds persisted levels ("loglevel", "loglevel:<name>"); drop them so
// the browser holds nothing and a stale DEBUG cannot override ROOT_LEVEL.
function purgePersistedLevels() {
  try {
    const storage = window.localStorage
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i)
      if (key === 'loglevel' || key?.startsWith('loglevel:')) storage.removeItem(key)
    }
  } catch {
    // Storage unavailable (privacy mode): nothing was persisted there.
  }
}

if (typeof window !== 'undefined') purgePersistedLevels()
log.setLevel(ROOT_LEVEL as log.LogLevelDesc, false)

// ─── Prefixed factory ─────────────────────────────────────────────────────────

/**
 * Returns a named logger that prefixes every message with `[name]`.
 * Each call with the same name returns the same logger instance.
 *
 * @example
 *   const logger = useLogger('auth')
 *   logger.debug('exchangeCode → POST', url)   // [auth] exchangeCode → POST …
 *   logger.warn('token refresh failed')
 */
const prefixed = new Set<string>()

export function useLogger(name: string): Logger {
  const logger = log.getLogger(name)
  if (prefixed.has(name)) return logger
  prefixed.add(name)

  // Prepend the bracketed namespace through loglevel's methodFactory hook, so the
  // prefix survives every rebuild (setLevel, window.__setLogLevel) and is added once.
  const base = logger.methodFactory
  logger.methodFactory = (methodName, level, loggerName) => {
    const raw = base(methodName, level, loggerName)
    return (...args: unknown[]) => raw(`[${name}]`, ...args)
  }
  logger.setLevel(ROOT_LEVEL as log.LogLevelDesc, false) // also applies the factory

  return logger
}

// ─── Runtime override (DevTools) ─────────────────────────────────────────────

declare global {
  interface Window { __setLogLevel: (level: string) => void }
}

if (typeof window !== 'undefined') {
  window.__setLogLevel = (level: string) => {
    log.setLevel(level as log.LogLevelDesc, false)
    // Propagate to all named loggers (each has its own level, set in useLogger)
    Object.values(log.getLoggers()).forEach(l => l.setLevel(level as log.LogLevelDesc, false))
    console.log(`[logger] level set to "${level}"`)
  }
}

export default log
