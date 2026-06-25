<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { format, formatDistanceToNow } from 'date-fns'

import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import ProgressBar from 'primevue/progressbar'
import Skeleton from 'primevue/skeleton'

import type { SuspiciousIP, LockedAccount, IPReputation } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()
const confirm = useConfirm()

const timeRange = ref('24h')
const timeRangeOptions = [
  { label: 'Last 15 Minutes', value: '15m' },
  { label: 'Last Hour', value: '1h' },
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' }
]

const selectedIP = ref<SuspiciousIP | null>(null)
const ipReputation = ref<IPReputation | null>(null)
const showIPDialog = ref(false)
const isLoadingReputation = ref(false)

const showBlockDialog = ref(false)
const blockForm = ref({
  ip_address: '',
  reason: '',
  duration_hours: 24,
  permanent: false
})

const threatLevelInfo = computed(() => {
  if (!store.threatMetrics) return { level: 'unknown', color: 'secondary', description: 'Loading...' }
  
  const { critical_events, error_events, warning_events } = store.threatMetrics.summary
  
  if (critical_events > 0) {
    return { level: 'CRITICAL', color: 'danger', description: `${critical_events} critical event(s) detected` }
  }
  if (error_events > 5) {
    return { level: 'HIGH', color: 'warning', description: `${error_events} error events in the period` }
  }
  if (error_events > 0 || warning_events > 10) {
    return { level: 'MEDIUM', color: 'info', description: 'Elevated activity detected' }
  }
  return { level: 'LOW', color: 'success', description: 'No significant threats' }
})

async function loadThreats() {
  try {
    await api.fetchThreatMetrics(timeRange.value)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load threat data', life: 3000 })
  }
}

async function viewIPDetails(ip: SuspiciousIP) {
  selectedIP.value = ip
  showIPDialog.value = true
  isLoadingReputation.value = true
  
  try {
    ipReputation.value = await api.fetchIPReputation(ip.ip_address)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load IP reputation', life: 3000 })
  } finally {
    isLoadingReputation.value = false
  }
}

function openBlockDialog(ip?: string) {
  blockForm.value = {
    ip_address: ip || '',
    reason: '',
    duration_hours: 24,
    permanent: false
  }
  showBlockDialog.value = true
}

async function blockIP() {
  try {
    await api.blockIP({
      ip_address: blockForm.value.ip_address,
      reason: blockForm.value.reason,
      duration_hours: blockForm.value.permanent ? undefined : blockForm.value.duration_hours,
      permanent: blockForm.value.permanent
    })
    toast.add({ severity: 'success', summary: 'Success', detail: 'IP blocked successfully', life: 3000 })
    showBlockDialog.value = false
    showIPDialog.value = false
    await loadThreats()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to block IP', life: 3000 })
  }
}

function getRiskScoreColor(score: number): string {
  if (score >= 75) return 'var(--color-status-critical)'
  if (score >= 50) return 'var(--color-status-danger)'
  if (score >= 25) return 'var(--color-status-warning)'
  return 'var(--color-status-secure)'
}

function formatTime(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

onMounted(() => {
  loadThreats()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Threat Intelligence</h1>
        <p class="text-[var(--color-text-muted)]">Security threat analysis and monitoring</p>
      </div>
      <div class="flex items-center gap-3">
        <Select 
          v-model="timeRange" 
          :options="timeRangeOptions"
          optionLabel="label"
          optionValue="value"
          @change="loadThreats"
          class="w-40"
        />
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadThreats"
          :loading="store.isLoading['threats']"
        />
      </div>
    </div>

    <!-- Threat Level Banner -->
    <div 
      class="p-4 rounded-xl mb-6 border"
      :class="{
        'bg-[var(--color-status-critical)]/10 border-[var(--color-status-critical)]/30': threatLevelInfo.level === 'CRITICAL',
        'bg-[var(--color-status-danger)]/10 border-[var(--color-status-danger)]/30': threatLevelInfo.level === 'HIGH',
        'bg-[var(--color-status-warning)]/10 border-[var(--color-status-warning)]/30': threatLevelInfo.level === 'MEDIUM',
        'bg-[var(--color-status-secure)]/10 border-[var(--color-status-secure)]/30': threatLevelInfo.level === 'LOW',
        'bg-[var(--color-surface-100)] border-[var(--color-border-subtle)]': threatLevelInfo.level === 'unknown'
      }"
    >
      <div class="flex items-center gap-4">
        <div 
          class="w-12 h-12 rounded-xl flex items-center justify-center"
          :class="{
            'bg-[var(--color-status-critical)]': threatLevelInfo.level === 'CRITICAL',
            'bg-[var(--color-status-danger)]': threatLevelInfo.level === 'HIGH',
            'bg-[var(--color-status-warning)]': threatLevelInfo.level === 'MEDIUM',
            'bg-[var(--color-status-secure)]': threatLevelInfo.level === 'LOW',
            'bg-[var(--color-surface-300)]': threatLevelInfo.level === 'unknown'
          }"
        >
          <i class="pi pi-shield text-2xl text-white"></i>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <span class="text-xl font-bold">Threat Level: {{ threatLevelInfo.level }}</span>
            <Tag :value="threatLevelInfo.level" :severity="threatLevelInfo.color" />
          </div>
          <p class="text-sm text-[var(--color-text-secondary)] mt-1">{{ threatLevelInfo.description }}</p>
        </div>
        <Button 
          label="Block IP" 
          icon="pi pi-ban" 
          severity="danger"
          outlined
          @click="openBlockDialog()"
        />
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div class="metric-card" style="--card-accent: var(--color-accent-primary)">
        <div class="metric-value">
          {{ store.threatMetrics?.summary.total_events.toLocaleString() || '—' }}
        </div>
        <div class="metric-label">Total Events</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-critical)">
        <div class="metric-value text-[var(--color-status-critical)]">
          {{ store.threatMetrics?.summary.critical_events || 0 }}
        </div>
        <div class="metric-label">Critical</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-danger)">
        <div class="metric-value text-[var(--color-status-danger)]">
          {{ store.threatMetrics?.summary.error_events || 0 }}
        </div>
        <div class="metric-label">Errors</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-warning)">
        <div class="metric-value text-[var(--color-status-warning)]">
          {{ store.threatMetrics?.summary.warning_events || 0 }}
        </div>
        <div class="metric-label">Warnings</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-accent-secondary)">
        <div class="metric-value">
          {{ store.threatMetrics?.summary.unique_attackers || 0 }}
        </div>
        <div class="metric-label">Unique Attackers</div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Top Threats -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-exclamation-triangle text-[var(--color-status-warning)]"></i>
          Top Threats
        </div>
        <div class="space-y-3">
          <template v-if="store.threatMetrics?.top_threats.length">
            <div 
              v-for="threat in store.threatMetrics.top_threats" 
              :key="threat.type"
              class="p-3 rounded-lg bg-[var(--color-surface-100)] border border-[var(--color-border-subtle)]"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium">{{ threat.type.replace(/_/g, ' ').toUpperCase() }}</span>
                <Tag :value="`${threat.count} events`" severity="danger" />
              </div>
              <div class="flex gap-4 text-xs text-[var(--color-text-muted)]">
                <span><i class="pi pi-globe mr-1"></i>{{ threat.unique_ips }} IPs</span>
                <span v-if="threat.affected_users"><i class="pi pi-users mr-1"></i>{{ threat.affected_users }} users</span>
                <span v-if="threat.affected_apps"><i class="pi pi-box mr-1"></i>{{ threat.affected_apps }} apps</span>
              </div>
            </div>
          </template>
          <div v-else class="text-center py-8 text-[var(--color-text-muted)]">
            <i class="pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"></i>
            <p>No significant threats detected</p>
          </div>
        </div>
      </div>

      <!-- Suspicious IPs -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-map-marker text-[var(--color-status-danger)]"></i>
          Suspicious IPs
        </div>
        <div class="space-y-2">
          <template v-if="store.threatMetrics?.suspicious_ips.length">
            <div 
              v-for="ip in store.threatMetrics.suspicious_ips" 
              :key="ip.ip_address"
              class="p-3 rounded-lg bg-[var(--color-surface-100)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border)] transition-colors cursor-pointer"
              @click="viewIPDetails(ip)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-mono font-medium">{{ ip.ip_address }}</div>
                  <div class="text-xs text-[var(--color-text-muted)] mt-1">
                    {{ ip.event_count }} events • Last seen {{ formatTime(ip.last_seen) }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex flex-wrap gap-1 max-w-32">
                    <Tag 
                      v-for="type in ip.event_types.slice(0, 2)" 
                      :key="type" 
                      :value="type" 
                      severity="secondary"
                      class="text-xs"
                    />
                  </div>
                  <Button 
                    icon="pi pi-ban" 
                    severity="danger" 
                    text 
                    rounded
                    size="small"
                    @click.stop="openBlockDialog(ip.ip_address)"
                    v-tooltip.top="'Block IP'"
                  />
                </div>
              </div>
            </div>
          </template>
          <div v-else class="text-center py-8 text-[var(--color-text-muted)]">
            <i class="pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"></i>
            <p>No suspicious IPs detected</p>
          </div>
        </div>
      </div>

      <!-- Locked Accounts -->
      <div class="panel lg:col-span-2">
        <div class="panel-header">
          <i class="pi pi-lock text-[var(--color-status-danger)]"></i>
          Locked Accounts
        </div>
        <DataTable 
          :value="store.threatMetrics?.locked_accounts || []"
          :loading="store.isLoading['threats']"
          class="data-table"
          stripedRows
        >
          <Column field="email" header="User" />
          <Column field="failed_attempts" header="Failed Attempts">
            <template #body="{ data }">
              <Tag :value="data.failed_attempts" severity="danger" />
            </template>
          </Column>
          <Column field="locked_at" header="Locked At">
            <template #body="{ data }">
              <span class="font-mono text-sm">{{ format(new Date(data.locked_at), 'MMM d, HH:mm') }}</span>
            </template>
          </Column>
          <Column field="locked_until" header="Locked Until">
            <template #body="{ data }">
              <span class="font-mono text-sm">{{ format(new Date(data.locked_until), 'MMM d, HH:mm') }}</span>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-[var(--color-text-muted)]">
              <i class="pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"></i>
              <p>No locked accounts</p>
            </div>
          </template>
        </DataTable>
      </div>
    </div>

    <!-- IP Details Dialog -->
    <Dialog 
      v-model:visible="showIPDialog" 
      header="IP Reputation" 
      :style="{ width: '600px' }"
      modal
    >
      <div v-if="isLoadingReputation" class="space-y-4">
        <Skeleton width="100%" height="24px" />
        <Skeleton width="100%" height="100px" />
        <Skeleton width="100%" height="150px" />
      </div>
      <div v-else-if="ipReputation" class="space-y-6">
        <!-- IP Header -->
        <div class="flex items-center justify-between">
          <div>
            <div class="font-mono text-xl font-bold">{{ ipReputation.ip_address }}</div>
            <div class="text-sm text-[var(--color-text-muted)]">
              First seen {{ formatTime(ipReputation.first_seen) }}
            </div>
          </div>
          <Tag 
            :value="ipReputation.is_blocked ? 'BLOCKED' : 'ACTIVE'" 
            :severity="ipReputation.is_blocked ? 'danger' : 'warning'"
          />
        </div>

        <!-- Risk Score -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-[var(--color-text-muted)]">Risk Score</span>
            <span class="font-bold" :style="{ color: getRiskScoreColor(ipReputation.risk_score) }">
              {{ ipReputation.risk_score }}/100
            </span>
          </div>
          <ProgressBar 
            :value="ipReputation.risk_score" 
            :showValue="false"
            :style="{ 
              '--p-progressbar-value-background': getRiskScoreColor(ipReputation.risk_score)
            }"
          />
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-4">
          <div class="p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div class="text-2xl font-bold">{{ ipReputation.events_24h }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Events (24h)</div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div class="text-2xl font-bold">{{ ipReputation.events_7d }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Events (7d)</div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div class="text-2xl font-bold text-[var(--color-status-danger)]">{{ ipReputation.failed_logins_24h }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Failed Logins (24h)</div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div class="text-2xl font-bold">{{ ipReputation.unique_users_targeted }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Users Targeted</div>
          </div>
        </div>

        <!-- Recent Events -->
        <div>
          <div class="text-sm font-medium mb-2">Recent Events</div>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div 
              v-for="(event, idx) in ipReputation.recent_events" 
              :key="idx"
              class="p-2 rounded bg-[var(--color-surface-100)] text-sm"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">{{ event.event_type }}</span>
                <span class="text-xs text-[var(--color-text-muted)]">{{ formatTime(event.created_at) }}</span>
              </div>
              <div v-if="event.user_email" class="text-xs text-[var(--color-text-muted)]">
                {{ event.user_email }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Close" severity="secondary" @click="showIPDialog = false" />
        <Button 
          v-if="ipReputation && !ipReputation.is_blocked"
          label="Block IP" 
          icon="pi pi-ban" 
          severity="danger"
          @click="openBlockDialog(ipReputation.ip_address)"
        />
      </template>
    </Dialog>

    <!-- Block IP Dialog -->
    <Dialog 
      v-model:visible="showBlockDialog" 
      header="Block IP Address" 
      :style="{ width: '450px' }"
      modal
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">IP Address</label>
          <InputText v-model="blockForm.ip_address" class="w-full" placeholder="203.0.113.50" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Reason</label>
          <Textarea v-model="blockForm.reason" class="w-full" rows="3" placeholder="Reason for blocking..." />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="blockForm.permanent" inputId="permanent" binary />
          <label for="permanent" class="text-sm">Permanent block</label>
        </div>
        <div v-if="!blockForm.permanent">
          <label class="block text-sm font-medium mb-1">Duration (hours)</label>
          <InputNumber v-model="blockForm.duration_hours" class="w-full" :min="1" :max="8760" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showBlockDialog = false" />
        <Button 
          label="Block IP" 
          icon="pi pi-ban" 
          severity="danger"
          @click="blockIP"
          :disabled="!blockForm.ip_address || !blockForm.reason"
        />
      </template>
    </Dialog>
  </div>
</template>
