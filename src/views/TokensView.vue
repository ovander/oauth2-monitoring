<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { format } from 'date-fns'
import { Line, Doughnut, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Skeleton from 'primevue/skeleton'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

const store = useMonitorStore()
const api = useApi()
const toast = useToast()

const period = ref('24h')
const periodOptions = [
  { label: 'Last 15 Minutes', value: '15m' },
  { label: 'Last Hour', value: '1h' },
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' }
]

// Computed: Check if we have token type data
const hasTokenTypeData = computed(() => {
  if (!store.tokenStats?.issued) return false
  const { access_tokens, refresh_tokens, id_tokens } = store.tokenStats.issued
  return (access_tokens + refresh_tokens + id_tokens) > 0
})

// Computed: Check if we have hourly data
const hasHourlyData = computed(() => {
  return store.tokenStats?.by_hour && store.tokenStats.by_hour.length > 0
})

// Computed: Check if we have app data
const hasAppData = computed(() => {
  return store.tokenStats?.by_app && store.tokenStats.by_app.length > 0
})

// Chart: Token Types Distribution
const tokenTypesChart = computed(() => ({
  labels: ['Access Tokens', 'Refresh Tokens', 'ID Tokens'],
  datasets: [{
    data: store.tokenStats?.issued ? [
      store.tokenStats.issued.access_tokens || 0,
      store.tokenStats.issued.refresh_tokens || 0,
      store.tokenStats.issued.id_tokens || 0
    ] : [0, 0, 0],
    backgroundColor: ['#3b82f6', '#8b5cf6', '#06b6d4'],
    borderWidth: 0
  }]
}))

const tokenTypesOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 20
      }
    }
  }
}

// Chart: Token Activity Over Time
const tokenActivityChart = computed(() => ({
  labels: store.tokenStats?.by_hour?.map(h => format(new Date(h.hour), 'HH:mm')) || [],
  datasets: [
    {
      label: 'Issued',
      data: store.tokenStats?.by_hour?.map(h => h.issued) || [],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4
    },
    {
      label: 'Refreshed',
      data: store.tokenStats?.by_hour?.map(h => h.refreshed) || [],
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      fill: true,
      tension: 0.4
    },
    {
      label: 'Revoked',
      data: store.tokenStats?.by_hour?.map(h => h.revoked) || [],
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      fill: true,
      tension: 0.4
    }
  ]
}))

const tokenActivityOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 20
      }
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#64748b' }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#64748b' }
    }
  }
}

// Chart: By App
const byAppChart = computed(() => ({
  labels: store.tokenStats?.by_app?.map(a => a.app_name) || [],
  datasets: [
    {
      label: 'Issued',
      data: store.tokenStats?.by_app?.map(a => a.issued) || [],
      backgroundColor: '#3b82f6'
    },
    {
      label: 'Refreshed',
      data: store.tokenStats?.by_app?.map(a => a.refreshed) || [],
      backgroundColor: '#8b5cf6'
    },
    {
      label: 'Revoked',
      data: store.tokenStats?.by_app?.map(a => a.revoked) || [],
      backgroundColor: '#ef4444'
    }
  ]
}))

const byAppOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 20
      }
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#64748b' },
      stacked: true
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#64748b' },
      stacked: true
    }
  }
}

// Computed stats
const totalIssued = computed(() => {
  if (!store.tokenStats?.issued) return 0
  return (store.tokenStats.issued.access_tokens || 0) + 
         (store.tokenStats.issued.refresh_tokens || 0) + 
         (store.tokenStats.issued.id_tokens || 0)
})

const securityIssues = computed(() => {
  if (!store.tokenStats) return 0
  return (store.tokenStats.expired_usage_attempts || 0) + (store.tokenStats.invalid_usage_attempts || 0)
})

async function loadTokenStats() {
  try {
    await api.fetchTokenStats(period.value)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load token statistics', life: 3000 })
  }
}

onMounted(() => {
  loadTokenStats()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Token Analytics</h1>
        <p class="text-[var(--color-text-muted)]">OAuth2 token usage and statistics</p>
      </div>
      <div class="flex items-center gap-3">
        <Select 
          v-model="period" 
          :options="periodOptions"
          optionLabel="label"
          optionValue="value"
          @change="loadTokenStats"
          class="w-40"
        />
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadTokenStats"
          :loading="store.isLoading['tokenStats']"
        />
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div class="metric-card" style="--card-accent: var(--color-accent-primary)">
        <div class="metric-value">
          <template v-if="store.tokenStats">{{ totalIssued.toLocaleString() }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Tokens Issued</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-accent-secondary)">
        <div class="metric-value">
          <template v-if="store.tokenStats">{{ (store.tokenStats.refreshed || 0).toLocaleString() }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Refreshed</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-warning)">
        <div class="metric-value text-[var(--color-status-warning)]">
          <template v-if="store.tokenStats">{{ store.tokenStats.revoked || 0 }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Revoked</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-danger)">
        <div class="metric-value text-[var(--color-status-danger)]">
          <template v-if="store.tokenStats">{{ store.tokenStats.expired_usage_attempts || 0 }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Expired Usage</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-critical)">
        <div class="metric-value text-[var(--color-status-critical)]">
          <template v-if="store.tokenStats">{{ store.tokenStats.invalid_usage_attempts || 0 }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Invalid Usage</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <!-- Token Types Pie Chart -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-chart-pie text-[var(--color-accent-primary)]"></i>
          Token Types Distribution
        </div>
        <div class="h-64">
          <Doughnut v-if="hasTokenTypeData" :data="tokenTypesChart" :options="tokenTypesOptions" />
          <div v-else-if="store.tokenStats" class="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <i class="pi pi-chart-pie text-3xl mb-2 opacity-50"></i>
            <p>No tokens issued in this period</p>
          </div>
          <div v-else class="h-full flex items-center justify-center">
            <Skeleton shape="circle" size="200px" />
          </div>
        </div>
      </div>

      <!-- Token Activity Timeline -->
      <div class="panel lg:col-span-2">
        <div class="panel-header">
          <i class="pi pi-chart-line text-[var(--color-accent-primary)]"></i>
          Token Activity Over Time
        </div>
        <div class="h-64">
          <Line v-if="hasHourlyData" :data="tokenActivityChart" :options="tokenActivityOptions" />
          <div v-else-if="store.tokenStats" class="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <i class="pi pi-chart-line text-3xl mb-2 opacity-50"></i>
            <p>No hourly data available</p>
            <p class="text-xs mt-1">Token activity will appear here over time</p>
          </div>
          <div v-else class="h-full flex items-center justify-center">
            <Skeleton width="100%" height="100%" />
          </div>
        </div>
      </div>
    </div>

    <!-- By App Chart -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-box text-[var(--color-accent-secondary)]"></i>
          Token Activity by Application
        </div>
        <div class="h-64">
          <Bar v-if="hasAppData" :data="byAppChart" :options="byAppOptions" />
          <div v-else class="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <i class="pi pi-box text-3xl mb-2 opacity-50"></i>
            <p>No application data available</p>
          </div>
        </div>
      </div>

      <!-- App Details Table -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-list text-[var(--color-accent-secondary)]"></i>
          Application Breakdown
        </div>
        <DataTable 
          :value="store.tokenStats?.by_app || []"
          :loading="store.isLoading['tokenStats']"
          class="data-table"
          stripedRows
        >
          <Column field="app_name" header="Application">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-[var(--color-accent-primary)]/10 flex items-center justify-center">
                  <i class="pi pi-box text-[var(--color-accent-primary)]"></i>
                </div>
                <span class="font-medium">{{ data.app_name }}</span>
              </div>
            </template>
          </Column>
          <Column field="issued" header="Issued">
            <template #body="{ data }">
              <Tag :value="data.issued.toLocaleString()" severity="info" />
            </template>
          </Column>
          <Column field="refreshed" header="Refreshed">
            <template #body="{ data }">
              <Tag :value="data.refreshed.toLocaleString()" severity="secondary" />
            </template>
          </Column>
          <Column field="revoked" header="Revoked">
            <template #body="{ data }">
              <Tag 
                :value="data.revoked.toLocaleString()" 
                :severity="data.revoked > 0 ? 'warning' : 'secondary'" 
              />
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-[var(--color-text-muted)]">
              No application data available
            </div>
          </template>
        </DataTable>
      </div>
    </div>

    <!-- Security Alerts Section -->
    <div v-if="securityIssues > 0" class="mt-6">
      <div class="panel border-l-4 border-l-[var(--color-status-danger)]">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-xl bg-[var(--color-status-danger)]/10 flex items-center justify-center flex-shrink-0">
            <i class="pi pi-exclamation-triangle text-2xl text-[var(--color-status-danger)]"></i>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold mb-2">Security Alerts</h3>
            <p class="text-[var(--color-text-secondary)] mb-4">
              Detected {{ securityIssues }} suspicious token usage attempts in the selected period.
            </p>
            <div class="flex flex-wrap gap-4">
              <div v-if="store.tokenStats?.expired_usage_attempts" class="flex items-center gap-2">
                <span class="severity-dot severity-warning"></span>
                <span class="text-sm">{{ store.tokenStats.expired_usage_attempts }} expired token attempts</span>
              </div>
              <div v-if="store.tokenStats?.invalid_usage_attempts" class="flex items-center gap-2">
                <span class="severity-dot severity-error"></span>
                <span class="text-sm">{{ store.tokenStats.invalid_usage_attempts }} invalid token attempts</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
