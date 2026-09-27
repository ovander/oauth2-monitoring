/**
 * State behind the access-policy decision log (Socrate A4): filters, a
 * cursor-paged list (newest first, "load older" by id) and the summary counts.
 * Kept out of the view so the paging and filter logic is unit-testable.
 */
import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import { sinceFromPeriod } from '@/utils/policy'
import type { PolicyDecisionRecord, PolicyDecisionFilter, PolicySummaryResponse } from '@/types'

export const PAGE_SIZE = 100

export interface DecisionFilters {
  correlationId: string
  outcome: 'all' | 'denied' | 'allowed'
  divergenceOnly: boolean
  source: '' | 'admin_pep' | 'decide_api'
  clientId: string
  period: '1h' | '24h' | '7d' | '30d' | 'all'
}

export function defaultFilters(): DecisionFilters {
  return { correlationId: '', outcome: 'all', divergenceOnly: false, source: '', clientId: '', period: '24h' }
}

/** Translate the UI filters into the API's query. */
export function toQuery(f: DecisionFilters, now: Date = new Date()): PolicyDecisionFilter {
  const q: PolicyDecisionFilter = { limit: PAGE_SIZE }
  if (f.correlationId.trim()) q.correlation_id = f.correlationId.trim()
  if (f.outcome !== 'all') q.allow = f.outcome === 'allowed'
  if (f.divergenceOnly) q.divergence = true
  if (f.source) q.source = f.source
  if (f.clientId.trim()) q.client_id = f.clientId.trim()
  // A correlation id names one request: searching it inside a time window
  // would hide it if it is older than the window.
  if (!q.correlation_id) q.since = sinceFromPeriod(f.period, now)
  return q
}

export function usePolicyDecisions() {
  const api = useApi()

  const filters   = ref<DecisionFilters>(defaultFilters())
  const decisions = ref<PolicyDecisionRecord[]>([])
  const mode      = ref('off')
  const summary   = ref<PolicySummaryResponse | null>(null)
  const loading   = ref(false)
  const error     = ref<string | null>(null)
  const exhausted = ref(false)

  const divergenceTotal = computed(() =>
    Object.values(summary.value?.summary.divergences ?? {}).reduce((a, b) => a + b, 0))

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const query = toQuery(filters.value)
      const [page, sum] = await Promise.all([
        api.fetchPolicyDecisions(query),
        api.fetchPolicySummary(sinceFromPeriod(filters.value.period === 'all' ? '30d' : filters.value.period)),
      ])
      decisions.value = page.decisions
      mode.value = page.mode
      summary.value = sum
      exhausted.value = page.decisions.length < PAGE_SIZE
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** Append the next page of older rows, using the last id as the cursor. */
  async function loadOlder(): Promise<void> {
    const last = decisions.value[decisions.value.length - 1]
    if (!last || exhausted.value) return
    loading.value = true
    error.value = null
    try {
      const page = await api.fetchPolicyDecisions({ ...toQuery(filters.value), before_id: last.id })
      decisions.value = [...decisions.value, ...page.decisions]
      exhausted.value = page.decisions.length < PAGE_SIZE
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    filters.value = defaultFilters()
  }

  return { filters, decisions, mode, summary, loading, error, exhausted, divergenceTotal, load, loadOlder, reset }
}
