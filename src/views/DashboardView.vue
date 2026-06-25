<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useSSE } from '@/composables/useSSE'
import { useLogger } from '@/utils/logger'

const log = useLogger('dashboard')
import { useToast } from 'primevue/usetoast'
import { format, formatDistanceToNow } from 'date-fns'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import ProgressBar from 'primevue/progressbar'

import { EVENT_TYPE_LABELS, SEVERITY_COLORS } from '@/types'
import type { Severity } from '@/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const router = useRouter()
const store = useMonitorStore()
const api = useApi()
const sse = useSSE()
const toast = useToast()

const refreshInterval = ref<number | null>(null)
const isInitialLoad = ref(true)

// Chart data
const chartData = computed(() => ({
  labels: store.loginTrends.map(t => format(new Date(t.date), 'MMM d')),
  datasets: [
    {
      label: 'Successful Logins',
      data: store.loginTrends.map(t => t.success_count),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.4
    },
    {
      label: 'Failed Logins',
      data: store.loginTrends.map(t => t.failure_count),
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      fill: true,
      tension: 0.4
    }
  ]
}))

const chartOptions = {
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

// Health status color
const healthStatusColor = computed(() => {
  if (!store.health) return 'secondary'
  switch (store.health.status) {
    case 'healthy': return 'success'
    case 'degraded': return 'warning'
    case 'unhealthy': return 'danger'
    default: return 'secondary'
  }
})

// Threat level badge
const threatLevelBadge = computed(() => {
  switch (store.threatLevel) {
    case 'critical': return { class: 'status-critical', label: 'CRITICAL' }
    case 'high': return { class: 'status-danger', label: 'HIGH' }
    case 'medium': return { class: 'status-warning', label: 'MEDIUM' }
    case 'low': return { class: 'status-secure', label: 'LOW' }
    default: return { class: 'status-info', label: 'UNKNOWN' }
  }
})

function getSeverityClass(severity: Severity): string {
  return `severity-${severity}`
}

function formatTime(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

async function loadDashboardData() {
  try {
    await Promise.all([
      api.fetchDashboardStats(),
      api.fetchRecentActivity(10),
      api.fetchLoginTrends(14),
      api.fetchHealth(),
      api.fetchThreatMetrics('24h'),
      api.fetchAlertHistory({ page_size: 5, acknowledged: false })
    ])
  } catch (error) {
    log.error('failed to load dashboard data:', error)
    if (isInitialLoad.value) {
      toast.add({
        severity: 'error',
        summary: 'Load Failed',
        detail: 'Could not load dashboard data',
        life: 5000
      })
    }
  } finally {
    isInitialLoad.value = false
  }
}

function navigateTo(route: string) {
  router.push({ name: route })
}

onMounted(async () => {
  await loadDashboardData()
  sse.connect()
  
  // Refresh data every 30 seconds
  refreshInterval.value = window.setInterval(loadDashboardData, 30000)
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
  sse.disconnect()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Security Dashboard</h1>
        <p class="text-[var(--color-text-muted)]">Real-time security monitoring overview</p>
      </div>
      <div class="flex items-center gap-3">
        <span :class="['status-badge', threatLevelBadge.class]">
          <i class="pi pi-shield"></i>
          Threat Level: {{ threatLevelBadge.label }}
        </span>
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadDashboardData"
          :loading="store.isLoading['stats']"
          v-tooltip.bottom="'Refresh'"
        />
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <!-- Total Users -->
      <div class="metric-card" style="--card-accent: #3b82f6">
        <div class="flex items-start justify-between">
          <div>
            <div class="metric-value text-[var(--color-accent-primary)]">
              <template v-if="store.stats">{{ store.stats.total_users.toLocaleString() }}</template>
              <Skeleton v-else width="80px" height="2rem" />
            </div>
            <div class="metric-label">Total Users</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-[var(--color-accent-primary)]/10 flex items-center justify-center">
            <i class="pi pi-users text-[var(--color-accent-primary)]"></i>
          </div>
        </div>
        <div v-if="store.stats" class="mt-3 text-xs text-[var(--color-text-muted)]">
          <span class="text-[var(--color-status-secure)]">{{ store.stats.active_users }}</span> active today
        </div>
      </div>

      <!-- Today's Logins -->
      <div class="metric-card" style="--card-accent: #10b981">
        <div class="flex items-start justify-between">
          <div>
            <div class="metric-value text-[var(--color-status-secure)]">
              <template v-if="store.stats">{{ store.stats.today_logins.toLocaleString() }}</template>
              <Skeleton v-else width="80px" height="2rem" />
            </div>
            <div class="metric-label">Logins Today</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-[var(--color-status-secure)]/10 flex items-center justify-center">
            <i class="pi pi-sign-in text-[var(--color-status-secure)]"></i>
          </div>
        </div>
        <div v-if="store.stats" class="mt-3 text-xs text-[var(--color-text-muted)]">
          <span class="text-[var(--color-status-secure)]">+{{ store.stats.today_signups }}</span> new signups
        </div>
      </div>

      <!-- Failed Logins -->
      <div class="metric-card" style="--card-accent: #f59e0b">
        <div class="flex items-start justify-between">
          <div>
            <div class="metric-value text-[var(--color-status-warning)]">
              <template v-if="store.stats">{{ store.stats.failed_logins_24h }}</template>
              <Skeleton v-else width="80px" height="2rem" />
            </div>
            <div class="metric-label">Failed (24h)</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-[var(--color-status-warning)]/10 flex items-center justify-center">
            <i class="pi pi-exclamation-triangle text-[var(--color-status-warning)]"></i>
          </div>
        </div>
        <div v-if="store.threatMetrics" class="mt-3 text-xs text-[var(--color-text-muted)]">
          <span class="text-[var(--color-status-warning)]">{{ store.threatMetrics.summary.unique_attackers }}</span> unique attackers
        </div>
      </div>

      <!-- Locked Accounts -->
      <div class="metric-card" style="--card-accent: #ef4444">
        <div class="flex items-start justify-between">
          <div>
            <div class="metric-value text-[var(--color-status-danger)]">
              <template v-if="store.stats">{{ store.stats.locked_accounts }}</template>
              <Skeleton v-else width="80px" height="2rem" />
            </div>
            <div class="metric-label">Locked Accounts</div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-[var(--color-status-danger)]/10 flex items-center justify-center">
            <i class="pi pi-lock text-[var(--color-status-danger)]"></i>
          </div>
        </div>
        <div v-if="store.threatMetrics" class="mt-3 text-xs text-[var(--color-text-muted)]">
          <span class="text-[var(--color-status-danger)]">{{ store.threatMetrics.summary.critical_events }}</span> critical events
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Login Trends Chart -->
      <div class="lg:col-span-2 panel">
        <div class="panel-header">
          <i class="pi pi-chart-line text-[var(--color-accent-primary)]"></i>
          Login Trends (14 Days)
        </div>
        <div class="h-64">
          <Line v-if="store.loginTrends.length > 0" :data="chartData" :options="chartOptions" />
          <div v-else class="h-full flex items-center justify-center">
            <Skeleton width="100%" height="100%" />
          </div>
        </div>
      </div>

      <!-- System Health -->
      <div class="panel">
        <div class="panel-header">
          <i class="pi pi-heart text-[var(--color-status-secure)]"></i>
          System Health
        </div>
        <div v-if="store.health" class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-[var(--color-text-secondary)]">Status</span>
            <Tag :value="store.health.status.toUpperCase()" :severity="healthStatusColor" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[var(--color-text-secondary)]">Database</span>
            <span class="font-mono text-sm">{{ store.health.database.latency }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[var(--color-text-secondary)]">Uptime</span>
            <span class="font-mono text-sm">{{ store.health.uptime }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[var(--color-text-secondary)]">Version</span>
            <span class="font-mono text-sm">{{ store.health.version }}</span>
          </div>
        </div>
        <div v-else class="space-y-4">
          <Skeleton v-for="i in 4" :key="i" width="100%" height="24px" />
        </div>
      </div>

      <!-- Live Events Feed -->
      <div class="lg:col-span-2 panel">
        <div class="panel-header justify-between">
          <div class="flex items-center gap-2">
            <i class="pi pi-bolt text-[var(--color-status-warning)]"></i>
            Live Events
          </div>
          <Button 
            label="View All" 
            icon="pi pi-arrow-right" 
            iconPos="right"
            text 
            size="small"
            @click="navigateTo('events')"
          />
        </div>
        <div class="space-y-2 max-h-80 overflow-y-auto">
          <template v-if="store.liveEvents.length > 0">
            <div 
              v-for="event in store.liveEvents.slice(0, 10)" 
              :key="event.id"
              class="event-item"
              :class="{ new: Date.now() - new Date(event.created_at).getTime() < 5000 }"
            >
              <div :class="['severity-dot', getSeverityClass(event.severity)]"></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ EVENT_TYPE_LABELS[event.event_type] || event.event_type }}</span>
                  <Tag :value="event.severity" :severity="event.severity === 'critical' ? 'danger' : event.severity" class="text-xs" />
                </div>
                <div class="text-xs text-[var(--color-text-muted)] mt-1">
                  <span v-if="event.user_email">{{ event.user_email }} • </span>
                  <span>{{ event.ip_address }}</span>
                </div>
              </div>
              <div class="text-xs text-[var(--color-text-muted)]">
                {{ formatTime(event.created_at) }}
              </div>
            </div>
          </template>
          <template v-else-if="store.recentActivity.length > 0">
            <div 
              v-for="activity in store.recentActivity" 
              :key="activity.id"
              class="event-item"
            >
              <div :class="['severity-dot', activity.success ? 'severity-info' : 'severity-warning']"></div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{{ activity.description }}</div>
                <div class="text-xs text-[var(--color-text-muted)] mt-1">
                  <span v-if="activity.user_email">{{ activity.user_email }} • </span>
                  <span>{{ activity.ip_address }}</span>
                </div>
              </div>
              <div class="text-xs text-[var(--color-text-muted)]">
                {{ formatTime(activity.created_at) }}
              </div>
            </div>
          </template>
          <div v-else class="text-center py-8 text-[var(--color-text-muted)]">
            <i class="pi pi-inbox text-3xl mb-2"></i>
            <p>No recent events</p>
          </div>
        </div>
      </div>

      <!-- Unacknowledged Alerts -->
      <div class="panel">
        <div class="panel-header justify-between">
          <div class="flex items-center gap-2">
            <i class="pi pi-bell text-[var(--color-status-danger)]"></i>
            Active Alerts
            <span 
              v-if="store.unacknowledgedAlerts > 0"
              class="w-5 h-5 flex items-center justify-center text-xs font-bold bg-[var(--color-status-danger)] text-white rounded-full"
            >
              {{ store.unacknowledgedAlerts }}
            </span>
          </div>
          <Button 
            label="Manage" 
            text 
            size="small"
            @click="navigateTo('alerts')"
          />
        </div>
        <div class="space-y-2">
          <template v-if="store.alertHistory.filter(a => !a.acknowledged).length > 0">
            <div 
              v-for="alert in store.alertHistory.filter(a => !a.acknowledged).slice(0, 5)" 
              :key="alert.id"
              class="p-3 rounded-lg border cursor-pointer transition-colors"
              :class="{
                'bg-[var(--color-status-critical)]/10 border-[var(--color-status-critical)]/30': alert.severity === 'critical',
                'bg-[var(--color-status-danger)]/10 border-[var(--color-status-danger)]/30': alert.severity === 'error',
                'bg-[var(--color-status-warning)]/10 border-[var(--color-status-warning)]/30': alert.severity === 'warning'
              }"
              @click="navigateTo('alerts')"
            >
              <div class="flex items-start gap-2">
                <i 
                  class="pi pi-exclamation-circle mt-0.5"
                  :class="{
                    'text-[var(--color-status-critical)]': alert.severity === 'critical',
                    'text-[var(--color-status-danger)]': alert.severity === 'error',
                    'text-[var(--color-status-warning)]': alert.severity === 'warning'
                  }"
                ></i>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">{{ alert.rule_name }}</div>
                  <div class="text-xs text-[var(--color-text-muted)] mt-1 truncate">{{ alert.message }}</div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="text-center py-8 text-[var(--color-text-muted)]">
            <i class="pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"></i>
            <p>No active alerts</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
