import { describe, it, expect, beforeEach, vi } from 'vitest'

// SECURITY.md: the SPA keeps nothing in localStorage or sessionStorage. loglevel
// persists levels there by default, so the logger must opt out — and clean up
// what earlier builds left behind.

async function loadLogger() {
  vi.resetModules()
  return import('@/utils/logger')
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('logger', () => {
  it('creating loggers and changing levels leaves browser storage empty', async () => {
    const { useLogger } = await loadLogger()
    useLogger('auth')
    useLogger('sse').warn('hello')
    window.__setLogLevel('debug')
    window.__setLogLevel('silent')
    useLogger('router')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).not.toContain('loglevel')
  })

  it('removes levels persisted by earlier builds and does not let them win', async () => {
    localStorage.setItem('loglevel', 'DEBUG')
    localStorage.setItem('loglevel:auth', 'TRACE')
    localStorage.setItem('unrelated', 'kept')
    const { default: log, useLogger } = await loadLogger()
    const auth = useLogger('auth')
    expect(localStorage.getItem('loglevel')).toBeNull()
    expect(localStorage.getItem('loglevel:auth')).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
    // Test runs are not DEV builds' production mode, so compare with the configured root level.
    expect(auth.getLevel()).toBe(log.getLevel())
  })

  it('the DevTools override still changes every logger', async () => {
    const { default: log, useLogger } = await loadLogger()
    const auth = useLogger('auth')
    window.__setLogLevel('error')
    expect(log.getLevel()).toBe(log.levels.ERROR)
    expect(auth.getLevel()).toBe(log.levels.ERROR)
  })
})

describe('logger prefix', () => {
  it('keeps a single [name] prefix, also after the level changes', async () => {
    const calls: unknown[][] = []
    // loglevel binds console methods when it builds a logger: spy before loading.
    for (const m of ['log', 'debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { calls.push(a) })
    }
    const { useLogger } = await loadLogger()
    const first = useLogger('prefix-test')
    const again = useLogger('prefix-test')
    expect(again).toBe(first)
    first.warn('before')
    window.__setLogLevel('debug')
    first.debug('after')
    const mine = calls.filter(a => a[0] === '[prefix-test]')
    expect(mine.map(a => a[1])).toEqual(['before', 'after'])
    expect(calls.some(a => a[0] === '[prefix-test]' && a[1] === '[prefix-test]')).toBe(false)
  })
})
