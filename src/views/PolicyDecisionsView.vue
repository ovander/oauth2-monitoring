<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { format } from 'date-fns'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'

import { usePolicyDecisions } from '@/composables/usePolicyDecisions'
import { reasonLabel, divergenceLabel, sourceLabel, outcome, principalLabel, obligationsLabel } from '@/utils/policy'
import type { PolicyDecisionRecord } from '@/types'

const route = useRoute()
const log = usePolicyDecisions()

const outcomeOptions = [
  { label: 'All outcomes', value: 'all' },
  { label: 'Denied', value: 'denied' },
  { label: 'Allowed (divergences)', value: 'allowed' },
]
const sourceOptions = [
  { label: 'All sources', value: '' },
  { label: 'Admin API', value: 'admin_pep' },
  { label: 'Applications', value: 'decide_api' },
]
const periodOptions = [
  { label: 'Last hour', value: '1h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'All time', value: 'all' },
]

const modeText = computed(() => {
  switch (log.mode.value) {
    case 'enforce': return { label: 'ENFORCE', severity: 'danger' as const, text: 'Denials are refused (403).' }
    case 'shadow':  return { label: 'SHADOW', severity: 'warn' as const, text: 'Nothing is refused; these are would-be denials and disagreements with the built-in checks.' }
    default:        return { label: 'OFF', severity: 'secondary' as const, text: 'The policy is not being consulted; nothing new is recorded.' }
  }
})

const summaryWindow = computed(() => (log.filters.value.period === 'all' ? 'last 30 days' : periodOptions.find(p => p.value === log.filters.value.period)?.label.toLowerCase()))

const selected = ref<PolicyDecisionRecord | null>(null)
const showDetails = ref(false)
function open(d: PolicyDecisionRecord) {
  selected.value = d
  showDetails.value = true
}

function byCorrelation(id?: string) {
  if (!id) return
  log.filters.value = { ...log.filters.value, correlationId: id }
  showDetails.value = false
  void log.load()
}

function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, HH:mm:ss')
}

onMounted(() => {
  // Deep link from a security event: /policy-decisions?correlation_id=…
  const cid = route.query.correlation_id
  if (typeof cid === 'string' && cid) log.filters.value.correlationId = cid
  void log.load()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Policy Decisions</h1>
        <p class="text-[var(--color-text-muted)]">
          Requests the access policy refused or would refuse, and every disagreement with the built-in checks
        </p>
      </div>
      <Button icon="pi pi-refresh" severity="secondary" text rounded :loading="log.loading.value" @click="log.load()" />
    </div>

    <!-- Mode -->
    <div class="panel mb-6 flex items-center gap-3" data-test="mode">
      <span class="text-sm text-[var(--color-text-muted)]">Mode</span>
      <Tag :value="modeText.label" :severity="modeText.severity" />
      <span v-if="log.summary.value" class="text-sm text-[var(--color-text-muted)]">
        policy v{{ log.summary.value.policy_version }}
      </span>
      <span class="text-sm text-[var(--color-text-secondary)]">{{ modeText.text }}</span>
    </div>

    <!-- Summary -->
    <div v-if="log.summary.value" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-test="summary">
      <div class="metric-card" style="--card-accent: var(--color-status-warning)">
        <div class="metric-value">{{ log.summary.value.summary.denials }}</div>
        <div class="metric-label">Denials · {{ summaryWindow }}</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-critical)">
        <div class="metric-value text-[var(--color-status-critical)]">{{ log.summary.value.summary.enforced_denials }}</div>
        <div class="metric-label">Refused (enforced)</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-accent-primary)">
        <div class="metric-value">{{ log.divergenceTotal.value }}</div>
        <div class="metric-label">
          Divergences — {{ log.summary.value.summary.divergences.pdp_deny_code_allow ?? 0 }} stricter,
          {{ log.summary.value.summary.divergences.pdp_allow_code_deny ?? 0 }} looser
        </div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-accent-cyan)">
        <div class="metric-value text-base">
          {{ log.summary.value.summary.denials_by_source.admin_pep ?? 0 }} admin ·
          {{ log.summary.value.summary.denials_by_source.decide_api ?? 0 }} apps
        </div>
        <div class="metric-label">Denials by source</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="panel mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div class="lg:col-span-2">
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Correlation ID</label>
          <InputText v-model="log.filters.value.correlationId" placeholder="From a user's error report or a security event" class="w-full font-mono" @keyup.enter="log.load()" />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Outcome</label>
          <Select v-model="log.filters.value.outcome" :options="outcomeOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Source</label>
          <Select v-model="log.filters.value.source" :options="sourceOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Application (client ID)</label>
          <InputText v-model="log.filters.value.clientId" class="w-full font-mono" @keyup.enter="log.load()" />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Period</label>
          <Select v-model="log.filters.value.period" :options="periodOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
      </div>
      <div class="flex items-center gap-4 mt-3">
        <div class="flex items-center gap-2">
          <Checkbox v-model="log.filters.value.divergenceOnly" inputId="div-only" binary />
          <label for="div-only" class="text-sm">Divergences only</label>
        </div>
        <Button label="Apply" icon="pi pi-filter" size="small" @click="log.load()" />
        <Button label="Reset" severity="secondary" text size="small" @click="log.reset(); log.load()" />
        <span v-if="log.filters.value.correlationId" class="text-xs text-[var(--color-text-muted)]">
          A correlation ID searches all time, whatever the period.
        </span>
      </div>
    </div>

    <Message v-if="log.error.value" severity="error" :closable="false" class="mb-4">{{ log.error.value }}</Message>

    <!-- Log -->
    <div class="panel">
      <DataTable :value="log.decisions.value" :loading="log.loading.value" class="data-table" stripedRows :rowHover="true" dataKey="id">
        <template #empty>
          <div class="text-center py-8 text-[var(--color-text-muted)]">
            <i class="pi pi-check-circle text-3xl mb-2 block"></i>
            No denials or divergences for these filters.
          </div>
        </template>
        <Column field="created_at" header="Time">
          <template #body="{ data }"><span class="text-sm whitespace-nowrap">{{ formatDate(data.created_at) }}</span></template>
        </Column>
        <Column header="Outcome">
          <template #body="{ data }"><Tag :value="outcome(data).label" :severity="outcome(data).severity" /></template>
        </Column>
        <Column field="action" header="Action">
          <template #body="{ data }">
            <div class="font-mono text-xs">{{ data.action }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">{{ sourceLabel(data.source) }}</div>
          </template>
        </Column>
        <Column header="Why">
          <template #body="{ data }">
            <div class="text-sm">{{ reasonLabel(data.reason) }}</div>
            <div v-if="data.rule" class="font-mono text-xs text-[var(--color-text-muted)]">{{ data.rule }} · v{{ data.policy_version }}</div>
            <div v-if="data.divergence" class="text-xs text-[var(--color-status-warning)]">{{ divergenceLabel(data.divergence) }}</div>
            <div v-if="data.obligations?.length" class="text-xs text-[var(--color-text-muted)]">Requires {{ obligationsLabel(data.obligations) }}</div>
          </template>
        </Column>
        <Column header="Who">
          <template #body="{ data }"><span class="text-sm">{{ principalLabel(data) }}</span></template>
        </Column>
        <Column field="ip_address" header="IP">
          <template #body="{ data }"><span class="font-mono text-xs">{{ data.ip_address || '—' }}</span></template>
        </Column>
        <Column style="width: 60px">
          <template #body="{ data }">
            <Button icon="pi pi-eye" severity="secondary" text rounded size="small" @click="open(data)" />
          </template>
        </Column>
      </DataTable>
      <div class="flex justify-center mt-4">
        <Button
          v-if="log.decisions.value.length && !log.exhausted.value"
          label="Load older"
          icon="pi pi-angle-down"
          severity="secondary"
          outlined
          :loading="log.loading.value"
          @click="log.loadOlder()"
        />
      </div>
    </div>

    <!-- Details -->
    <Dialog v-model:visible="showDetails" header="Policy decision" :style="{ width: '600px' }" modal>
      <div v-if="selected" class="grid grid-cols-2 gap-4 text-sm">
        <div><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Outcome</div><Tag :value="outcome(selected).label" :severity="outcome(selected).severity" /></div>
        <div><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Mode</div>{{ selected.mode }}{{ selected.enforced ? ' (honoured)' : '' }}</div>
        <div class="col-span-2"><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Action</div><span class="font-mono">{{ selected.action }}</span></div>
        <div class="col-span-2"><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Why</div>{{ reasonLabel(selected.reason) }}<span v-if="selected.rule" class="font-mono"> — rule {{ selected.rule }}, policy v{{ selected.policy_version }}</span></div>
        <div v-if="selected.obligations?.length" class="col-span-2"><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Obligations</div>{{ obligationsLabel(selected.obligations) }} <span class="font-mono text-xs">({{ selected.obligations.join(', ') }})</span></div>
        <div v-if="selected.divergence" class="col-span-2"><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Divergence</div>{{ divergenceLabel(selected.divergence) }} (the request ended with HTTP {{ selected.status_code }})</div>
        <div><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Source</div>{{ sourceLabel(selected.source) }}</div>
        <div><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Who</div>{{ principalLabel(selected) }}</div>
        <div v-if="selected.resource_type || selected.resource_id"><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Resource</div><span class="font-mono">{{ selected.resource_type }} {{ selected.resource_id }}</span></div>
        <div><div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">IP</div><span class="font-mono">{{ selected.ip_address || '—' }}</span></div>
        <div v-if="selected.correlation_id" class="col-span-2">
          <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Correlation ID</div>
          <span class="font-mono text-xs">{{ selected.correlation_id }}</span>
          <Button label="All decisions for this request" size="small" text @click="byCorrelation(selected.correlation_id)" />
        </div>
      </div>
      <template #footer>
        <Button label="Close" severity="secondary" @click="showDetails = false" />
      </template>
    </Dialog>
  </div>
</template>
