import { vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Vitest 4 uses a file-based localStorage backend in jsdom which does not
// implement the full Storage interface (no .clear()). Stub both storages with
// plain in-memory implementations so every test gets a clean, portable store.
//
// Like a real Storage, property access is item access (`localStorage.k = v`
// is setItem): libraries such as loglevel write that way, and a plain object
// would hide those writes from the "storage stays empty" assertions.
function makeStorageMock(): Storage {
  let store: Record<string, string> = {}
  const api = {
    getItem:    (key: string) => store[key] ?? null,
    setItem:    (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear:      () => { store = {} },
    get length() { return Object.keys(store).length },
    key:        (i: number) => Object.keys(store)[i] ?? null,
  }
  const isItem = (t: object, p: string | symbol): p is string => typeof p === 'string' && !(p in t)
  return new Proxy(api, {
    get: (t, p, r) => (isItem(t, p) ? store[p] : Reflect.get(t, p, r)),
    set: (t, p, v, r) => (isItem(t, p) ? ((store[p] = String(v)), true) : Reflect.set(t, p, v, r)),
    deleteProperty: (t, p) => (isItem(t, p) ? (delete store[p], true) : Reflect.deleteProperty(t, p)),
    has: (t, p) => (typeof p === 'string' && p in store) || p in t,
    ownKeys: () => Object.keys(store),
    getOwnPropertyDescriptor: (_t, p) =>
      typeof p === 'string' && p in store
        ? { value: store[p], enumerable: true, configurable: true, writable: true }
        : undefined,
  }) as unknown as Storage
}

// Fresh Pinia + fresh storages for every test
beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage',    makeStorageMock())
  vi.stubGlobal('sessionStorage',  makeStorageMock())
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Web Crypto is provided by jsdom ≥ 24 — no polyfill needed.
// If tests throw "crypto is not defined" ensure jsdom ≥ 24 is installed.
