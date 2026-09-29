import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'

function clearThemeCookie() {
  document.cookie = 'theme=; Path=/; Max-Age=0'
}

function stubSystemDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: dark && q === '(prefers-color-scheme: dark)',
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {}
  }))
}

beforeEach(() => {
  clearThemeCookie()
  document.documentElement.classList.remove('dark-mode')
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />'
})

describe('themeStore', () => {
  it('starts light when the system prefers light and no choice was saved', () => {
    stubSystemDark(false)
    const theme = useThemeStore()
    expect(theme.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f1f5f9')
  })

  it('follows a dark system preference on first visit', () => {
    stubSystemDark(true)
    const theme = useThemeStore()
    expect(theme.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true)
  })

  it('a saved choice wins over the system preference', () => {
    stubSystemDark(true)
    document.cookie = 'theme=light; Path=/'
    expect(useThemeStore().isDark).toBe(false)
  })

  it('toggling switches the <html> class and remembers the choice in a cookie', () => {
    stubSystemDark(false)
    const theme = useThemeStore()
    theme.toggleTheme()
    expect(theme.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0f172a')
    expect(document.cookie).toContain('theme=dark')

    theme.toggleTheme()
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false)
    expect(document.cookie).toContain('theme=light')
  })

  it('ignores an unexpected cookie value', () => {
    stubSystemDark(false)
    document.cookie = 'theme=<script>; Path=/'
    expect(useThemeStore().isDark).toBe(false)
  })

  it('never writes to localStorage or sessionStorage (SECURITY.md)', () => {
    stubSystemDark(false)
    const theme = useThemeStore()
    theme.toggleTheme()
    theme.setTheme(false)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
