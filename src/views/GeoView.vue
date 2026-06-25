<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { format, formatDistanceToNow } from 'date-fns'
import { Bar, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Card from 'primevue/card'

import type { GeoCountry, GeoCity, GeoAnomaly } from '@/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

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

// Summary computed values
const totalLogins = computed(() => {
  if (!store.geoAnalytics?.by_country) return 0
  return store.geoAnalytics.by_country.reduce((sum, c) => sum + c.login_count, 0)
})

const totalFailed = computed(() => {
  if (!store.geoAnalytics?.by_country) return 0
  return store.geoAnalytics.by_country.reduce((sum, c) => sum + c.failed_count, 0)
})

const uniqueCountries = computed(() => {
  return store.geoAnalytics?.by_country?.length || 0
})

const uniqueCities = computed(() => {
  return store.geoAnalytics?.by_city?.length || 0
})

const anomalyCount = computed(() => {
  return store.geoAnalytics?.anomalies?.length || 0
})

// Check if we have data
const hasCountryData = computed(() => {
  return store.geoAnalytics?.by_country && store.geoAnalytics.by_country.length > 0
})

const hasCityData = computed(() => {
  return store.geoAnalytics?.by_city && store.geoAnalytics.by_city.length > 0
})

const hasAnomalies = computed(() => {
  return store.geoAnalytics?.anomalies && store.geoAnalytics.anomalies.length > 0
})

// Country distribution chart
const countryChart = computed(() => {
  const countries = store.geoAnalytics?.by_country?.slice(0, 10) || []
  return {
    labels: countries.map(c => c.country_name),
    datasets: [
      {
        label: 'Successful Logins',
        data: countries.map(c => c.login_count - c.failed_count),
        backgroundColor: '#3b82f6'
      },
      {
        label: 'Failed Logins',
        data: countries.map(c => c.failed_count),
        backgroundColor: '#ef4444'
      }
    ]
  }
})

const countryChartOptions = {
  indexAxis: 'y' as const,
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
      stacked: true,
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#64748b' }
    },
    y: {
      stacked: true,
      grid: { display: false },
      ticks: { color: '#94a3b8' }
    }
  }
}

// Country pie chart for distribution
const countryPieChart = computed(() => {
  const countries = store.geoAnalytics?.by_country?.slice(0, 6) || []
  const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
  return {
    labels: countries.map(c => c.country_name),
    datasets: [{
      data: countries.map(c => c.login_count),
      backgroundColor: colors.slice(0, countries.length),
      borderWidth: 0
    }]
  }
})

const pieChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#94a3b8',
        usePointStyle: true,
        padding: 15,
        font: { size: 11 }
      }
    }
  }
}

// Country code to flag emoji
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '🌐'
  if (code === 'XX') return '❓'
  if (code === 'LO') return '🏠'
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

// Get failure rate
function failureRate(country: GeoCountry): string {
  if (country.login_count === 0) return '0%'
  return ((country.failed_count / country.login_count) * 100).toFixed(1) + '%'
}

// Severity for anomaly
function getAnomalySeverity(anomaly: GeoAnomaly): 'danger' | 'warn' | 'info' {
  const desc = anomaly.description.toLowerCase()
  if (desc.includes('suspicious') || desc.includes('unusual')) return 'danger'
  if (desc.includes('multiple')) return 'warn'
  return 'info'
}

async function loadGeoData() {
  try {
    await api.fetchGeoAnalytics(period.value)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load geographic data', life: 3000 })
  }
}

function formatTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

onMounted(() => {
  loadGeoData()
})
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-[var(--color-text-primary)] font-display">
          Geographic Analytics
        </h1>
        <p class="text-[var(--color-text-muted)] text-sm mt-1">
          Global authentication activity and anomaly detection
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Select 
          v-model="period"
          :options="periodOptions"
          optionLabel="label"
          optionValue="value"
          class="w-44"
          @change="loadGeoData"
        />
        <Button 
          icon="pi pi-refresh" 
          text 
          rounded
          @click="loadGeoData"
          :loading="store.isLoading['geo']"
        />
      </div>
    </div>

    <!-- GeoIP Status Banner -->
    <Message 
      v-if="store.geoAnalytics && !store.geoAnalytics.geo_configured" 
      severity="warn" 
      :closable="false"
      class="mb-6"
    >
      <template #default>
        <div class="flex items-center gap-2">
          <i class="pi pi-exclamation-triangle"></i>
          <span>
            <strong>GeoIP database not configured.</strong> 
            Geographic data is limited. Configure MaxMind GeoLite2 for full location intelligence.
          </span>
        </div>
      </template>
    </Message>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div class="metric-card" style="--card-accent: var(--color-accent-primary)">
        <div class="metric-value">
          <template v-if="store.geoAnalytics">{{ totalLogins.toLocaleString() }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Total Logins</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-danger)">
        <div class="metric-value text-[var(--color-status-danger)]">
          <template v-if="store.geoAnalytics">{{ totalFailed.toLocaleString() }}</template>
          <Skeleton v-else width="60px" height="2rem" />
        </div>
        <div class="metric-label">Failed Logins</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-accent-secondary)">
        <div class="metric-value">
          <template v-if="store.geoAnalytics">{{ uniqueCountries }}</template>
          <Skeleton v-else width="40px" height="2rem" />
        </div>
        <div class="metric-label">Countries</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-accent-tertiary)">
        <div class="metric-value">
          <template v-if="store.geoAnalytics">{{ uniqueCities }}</template>
          <Skeleton v-else width="40px" height="2rem" />
        </div>
        <div class="metric-label">Cities</div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-warning)">
        <div class="metric-value" :class="{ 'text-[var(--color-status-warning)]': anomalyCount > 0 }">
          <template v-if="store.geoAnalytics">{{ anomalyCount }}</template>
          <Skeleton v-else width="40px" height="2rem" />
        </div>
        <div class="metric-label">Anomalies</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <!-- Country Distribution Pie -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-chart-pie text-[var(--color-accent-primary)]"></i>
          Login Distribution by Country
        </div>
        <div class="h-64">
          <Doughnut v-if="hasCountryData" :data="countryPieChart" :options="pieChartOptions" />
          <div v-else-if="store.geoAnalytics" class="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <i class="pi pi-globe text-3xl mb-2 opacity-50"></i>
            <p>No geographic data available</p>
          </div>
          <div v-else class="h-full flex items-center justify-center">
            <Skeleton shape="circle" size="180px" />
          </div>
        </div>
      </div>

      <!-- Country Bar Chart -->
      <div class="panel lg:col-span-2">
        <div class="panel-header">
          <i class="pi pi-chart-bar text-[var(--color-accent-secondary)]"></i>
          Top Countries by Login Activity
        </div>
        <div class="h-64">
          <Bar v-if="hasCountryData" :data="countryChart" :options="countryChartOptions" />
          <div v-else-if="store.geoAnalytics" class="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <i class="pi pi-chart-bar text-3xl mb-2 opacity-50"></i>
            <p>No country data available</p>
          </div>
          <div v-else class="h-full flex items-center justify-center">
            <Skeleton width="100%" height="100%" />
          </div>
        </div>
      </div>
    </div>

    <!-- Anomalies Section -->
    <div v-if="hasAnomalies" class="mb-6">
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-exclamation-triangle text-[var(--color-status-warning)]"></i>
          Geographic Anomalies
          <Tag :value="anomalyCount.toString()" severity="warn" class="ml-2" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          <div 
            v-for="anomaly in store.geoAnalytics?.anomalies" 
            :key="anomaly.user_id + anomaly.created_at"
            class="anomaly-card"
            :class="{
              'border-[var(--color-status-danger)]': getAnomalySeverity(anomaly) === 'danger',
              'border-[var(--color-status-warning)]': getAnomalySeverity(anomaly) === 'warn',
              'border-[var(--color-accent-primary)]': getAnomalySeverity(anomaly) === 'info'
            }"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <i 
                  class="pi pi-user text-sm" 
                  :class="{
                    'text-[var(--color-status-danger)]': getAnomalySeverity(anomaly) === 'danger',
                    'text-[var(--color-status-warning)]': getAnomalySeverity(anomaly) === 'warn'
                  }"
                ></i>
                <span class="text-sm font-medium text-[var(--color-text-primary)]">
                  {{ anomaly.user_email }}
                </span>
              </div>
              <span class="text-xs text-[var(--color-text-muted)]">
                {{ formatTime(anomaly.created_at) }}
              </span>
            </div>
            <p class="text-sm text-[var(--color-text-secondary)] mb-2">
              {{ anomaly.description }}
            </p>
            <div class="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
              <span>
                <strong>Usual:</strong> {{ anomaly.usual_country }}
              </span>
              <i class="pi pi-arrow-right"></i>
              <span class="text-[var(--color-status-warning)]">
                <strong>Current:</strong> {{ anomaly.login_country }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Country Table -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-flag text-[var(--color-accent-primary)]"></i>
          Countries
        </div>
        <DataTable 
          :value="store.geoAnalytics?.by_country || []"
          :loading="store.isLoading['geo']"
          class="data-table"
          stripedRows
          :rowHover="true"
          :scrollable="true"
          scrollHeight="400px"
        >
          <Column header="Country" style="min-width: 180px">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <span class="text-xl">{{ countryFlag(data.country_code) }}</span>
                <div>
                  <div class="font-medium text-[var(--color-text-primary)]">{{ data.country_name }}</div>
                  <div class="text-xs text-[var(--color-text-muted)]">{{ data.country_code }}</div>
                </div>
              </div>
            </template>
          </Column>
          <Column field="login_count" header="Logins" sortable style="min-width: 100px">
            <template #body="{ data }">
              <span class="font-mono">{{ data.login_count.toLocaleString() }}</span>
            </template>
          </Column>
          <Column field="unique_users" header="Users" sortable style="min-width: 80px">
            <template #body="{ data }">
              <span class="font-mono">{{ data.unique_users }}</span>
            </template>
          </Column>
          <Column header="Failed" sortable style="min-width: 100px">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <span class="font-mono" :class="{ 'text-[var(--color-status-danger)]': data.failed_count > 0 }">
                  {{ data.failed_count }}
                </span>
                <Tag 
                  v-if="data.failed_count > 0"
                  :value="failureRate(data)"
                  :severity="parseFloat(failureRate(data)) > 20 ? 'danger' : 'warn'"
                  class="text-xs"
                />
              </div>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-[var(--color-text-muted)]">
              <i class="pi pi-globe text-3xl mb-2"></i>
              <p>No country data available</p>
            </div>
          </template>
        </DataTable>
      </div>

      <!-- City Table -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-map-marker text-[var(--color-accent-secondary)]"></i>
          Cities
        </div>
        <DataTable 
          :value="store.geoAnalytics?.by_city || []"
          :loading="store.isLoading['geo']"
          class="data-table"
          stripedRows
          :rowHover="true"
          :scrollable="true"
          scrollHeight="400px"
        >
          <Column header="City" style="min-width: 180px">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <span class="text-lg">{{ countryFlag(data.country_code) }}</span>
                <div>
                  <div class="font-medium text-[var(--color-text-primary)]">{{ data.city }}</div>
                  <div class="text-xs text-[var(--color-text-muted)]">
                    {{ data.latitude.toFixed(2) }}°, {{ data.longitude.toFixed(2) }}°
                  </div>
                </div>
              </div>
            </template>
          </Column>
          <Column field="login_count" header="Logins" sortable style="min-width: 100px">
            <template #body="{ data }">
              <span class="font-mono">{{ data.login_count.toLocaleString() }}</span>
            </template>
          </Column>
          <Column header="Failed" sortable style="min-width: 100px">
            <template #body="{ data }">
              <span class="font-mono" :class="{ 'text-[var(--color-status-danger)]': data.failed_count > 0 }">
                {{ data.failed_count }}
              </span>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-[var(--color-text-muted)]">
              <i class="pi pi-map-marker text-3xl mb-2"></i>
              <p>No city data available</p>
            </div>
          </template>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<style scoped>
.anomaly-card {
  background: var(--color-surface-100);
  border: 1px solid var(--color-border);
  border-left-width: 3px;
  border-radius: var(--radius-lg);
  padding: 1rem;
  transition: all 0.2s ease;
}

.anomaly-card:hover {
  background: var(--color-surface-200);
}
</style>
