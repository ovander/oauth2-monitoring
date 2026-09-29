import { computed } from 'vue'
import { useThemeStore } from '@/stores/themeStore'

/**
 * Chart.js colours for legends, axis ticks and grid lines, read from the
 * palette in style.css so charts follow the light / dark scheme. Recomputed
 * when the scheme changes; vue-chartjs redraws on the new options.
 */
export function useChartTheme() {
  const theme = useThemeStore()

  return computed(() => {
    // Dependency on the scheme: the CSS variables below change with the <html> class.
    const dark = theme.isDark
    const css = getComputedStyle(document.documentElement)
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    return {
      legend: v('--color-text-secondary', dark ? '#cbd5e1' : '#475569'),
      tick: v('--color-text-muted', dark ? '#94a3b8' : '#64748b'),
      grid: v('--color-border-subtle', dark ? '#273449' : '#e2e8f0')
    }
  })
}
