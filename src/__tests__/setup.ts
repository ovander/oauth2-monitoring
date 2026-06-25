import { vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Vitest 4 uses a file-based localStorage backend in jsdom which does not
// implement the full Storage interface (no .clear()). Stub both storages with
// plain in-memory implementations so every test gets a clean, portable store.
function makeStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem:    (key: string) => store[key] ?? null,
    setItem:    (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear:      () => { store = {} },
    get length() { return Object.keys(store).length },
    key:        (i: number) => Object.keys(store)[i] ?? null,
  }
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
