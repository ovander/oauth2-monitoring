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
 */

import log from 'loglevel'
import type { Logger } from 'loglevel'

// ─── Root level ──────────────────────────────────────────────────────────────

const ROOT_LEVEL = import.meta.env.DEV ? 'debug' : 'warn'
log.setDefaultLevel(ROOT_LEVEL as log.LogLevelDesc)

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
export function useLogger(name: string): Logger {
  const logger = log.getLogger(name)
  logger.setLevel(ROOT_LEVEL as log.LogLevelDesc)

  // Wrap each method to prepend the bracketed namespace
  const prefix = `[${name}]`
  const original = {
    trace: logger.trace.bind(logger),
    debug: logger.debug.bind(logger),
    info:  logger.info.bind(logger),
    warn:  logger.warn.bind(logger),
    error: logger.error.bind(logger),
  }

  logger.trace = (...args) => original.trace(prefix, ...args)
  logger.debug = (...args) => original.debug(prefix, ...args)
  logger.info  = (...args) => original.info (prefix, ...args)
  logger.warn  = (...args) => original.warn (prefix, ...args)
  logger.error = (...args) => original.error(prefix, ...args)

  return logger
}

// ─── Runtime override (DevTools) ─────────────────────────────────────────────

declare global {
  interface Window { __setLogLevel: (level: string) => void }
}

if (typeof window !== 'undefined') {
  window.__setLogLevel = (level: string) => {
    log.setLevel(level as log.LogLevelDesc)
    // Propagate to all named loggers
    Object.keys((log as unknown as { loggers: Record<string, Logger> }).loggers ?? {}).forEach(k => {
      log.getLogger(k).setLevel(level as log.LogLevelDesc)
    })
    console.log(`[logger] level set to "${level}"`)
  }
}

export default log
