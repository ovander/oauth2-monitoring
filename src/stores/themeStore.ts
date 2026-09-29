import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * Light / dark colour scheme.
 *
 * First visit follows the system setting (`prefers-color-scheme`); an explicit
 * choice from the toggle is remembered in a plain preference cookie. Browser
 * storage is deliberately not used: SECURITY.md keeps localStorage and
 * sessionStorage empty, and a theme is no reason to start.
 *
 * The `dark-mode` class on <html> switches both the palette in style.css and
 * PrimeVue (its `darkModeSelector`).
 */
export const THEME_COOKIE = 'theme'
const DARK_CLASS = 'dark-mode'
const ONE_YEAR = 60 * 60 * 24 * 365

// Browser chrome colour (mobile address bar) — the page background of each scheme.
const THEME_COLOR = { light: '#f1f5f9', dark: '#0f172a' } as const

function readCookie(): 'light' | 'dark' | null {
  const m = document.cookie.match(/(?:^|;\s*)theme=(light|dark)(?:;|$)/)
  return m ? (m[1] as 'light' | 'dark') : null
}

function writeCookie(value: 'light' | 'dark') {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Strict${secure}`
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(dark: boolean) {
  document.documentElement.classList.toggle(DARK_CLASS, dark)
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

export const useThemeStore = defineStore('theme', () => {
  const saved = readCookie()
  const isDark = ref(saved ? saved === 'dark' : systemPrefersDark())

  // sync: the class must be on <html> before anything reads the CSS variables (useChartTheme).
  watch(isDark, apply, { immediate: true, flush: 'sync' })

  function setTheme(dark: boolean) {
    isDark.value = dark
    writeCookie(dark ? 'dark' : 'light')
  }

  function toggleTheme() {
    setTheme(!isDark.value)
  }

  return { isDark, setTheme, toggleTheme }
})
