<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { format } from 'date-fns'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Paginator from 'primevue/paginator'

import type { AdminAuditLog } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()

const page = ref(1)
const pageSize = ref(25)
const isExporting = ref(false)

const filters = ref({
  action: '',
  target_type: '' as string,
  period: '7d'
})

const targetTypeOptions = [
  { label: 'All targets', value: '' },
  { label: 'User', value: 'user' },
  { label: 'Application', value: 'application' },
  { label: 'Settings', value: 'settings' }
]

const periodOptions = [
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'All Time', value: 'all' }
]

const showDetailsDialog = ref(false)
const selectedLog = ref<AdminAuditLog | null>(null)

// Translate the period selector into an RFC3339 start_date the server understands.
function startDateFromPeriod(period: string): string | undefined {
  const now = new Date()
  switch (period) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    default: return undefined
  }
}

function currentParams() {
  return {
    action: filters.value.action || undefined,
    target_type: filters.value.target_type || undefined,
    start_date: startDateFromPeriod(filters.value.period),
    page: page.value,
    page_size: pageSize.value
  }
}

async function loadLogs() {
  try {
    await api.fetchAuditLogs(currentParams())
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load audit logs', life: 3000 })
  }
}

function applyFilters() {
  page.value = 1
  loadLogs()
}

function onPage(event: any) {
  page.value = event.page + 1
  pageSize.value = event.rows
  loadLogs()
}

function showDetails(log: AdminAuditLog) {
  selectedLog.value = log
  showDetailsDialog.value = true
}

// The export endpoint is bearer-protected, so a bare anchor href cannot carry
// the Authorization header. Fetch with auth, then download the resulting blob.
async function exportCsv() {
  isExporting.value = true
  try {
    const url = api.getAuditLogExportUrl({
      action: filters.value.action || undefined,
      target_type: filters.value.target_type || undefined,
      start_date: startDateFromPeriod(filters.value.period)
    })
    const response = await api.fetchWithAuth(url)
    if (!response.ok) throw new Error('export failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `admin-audit-logs-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
    toast.add({ severity: 'success', summary: 'Exported', detail: 'Audit log CSV downloaded', life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to export audit logs', life: 3000 })
  } finally {
    isExporting.value = false
  }
}

function targetSeverity(type: string): 'info' | 'warning' | 'secondary' {
  if (type === 'user') return 'info'
  if (type === 'application') return 'warning'
  return 'secondary'
}

function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm:ss')
}

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

onMounted(() => {
  loadLogs()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Admin Audit Trail</h1>
        <p class="text-[var(--color-text-muted)]">Every administrative action — who changed what, and when</p>
      </div>
      <div class="flex items-center gap-3">
        <Button
          label="Export CSV"
          icon="pi pi-download"
          severity="secondary"
          outlined
          :loading="isExporting"
          @click="exportCsv"
        />
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          @click="loadLogs"
          :loading="store.isLoading['auditLogs']"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="panel mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Action</label>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="filters.action"
              placeholder="e.g. unlock_user"
              class="w-full"
              @keyup.enter="applyFilters"
            />
          </IconField>
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Target Type</label>
          <Select
            v-model="filters.target_type"
            :options="targetTypeOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase mb-1">Period</label>
          <Select
            v-model="filters.period"
            :options="periodOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <Button label="Apply Filters" icon="pi pi-filter" @click="applyFilters" />
      </div>
    </div>

    <!-- Logs Table -->
    <div class="panel">
      <DataTable
        :value="store.auditLogs"
        :loading="store.isLoading['auditLogs']"
        class="data-table"
        stripedRows
        :rowHover="true"
        dataKey="id"
      >
        <template #empty>
          <div class="text-center py-8 text-[var(--color-text-muted)]">
            <i class="pi pi-inbox text-3xl mb-2 block"></i>
            No administrative actions recorded for this period.
          </div>
        </template>

        <Column field="created_at" header="Time">
          <template #body="{ data }">
            <span class="text-sm whitespace-nowrap">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>
        <Column field="admin_email" header="Admin">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-full bg-[var(--color-surface-300)] flex items-center justify-center">
                <i class="pi pi-user-edit text-xs"></i>
              </div>
              <div>
                <div class="font-medium text-sm">{{ data.admin_email || `Admin #${data.admin_id}` }}</div>
              </div>
            </div>
          </template>
        </Column>
        <Column field="action" header="Action">
          <template #body="{ data }">
            <span class="font-medium">{{ actionLabel(data.action) }}</span>
          </template>
        </Column>
        <Column field="target_type" header="Target">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <Tag :value="data.target_type" :severity="targetSeverity(data.target_type)" />
              <span v-if="data.target_name" class="text-sm">{{ data.target_name }}</span>
              <span v-else-if="data.target_id" class="text-xs text-[var(--color-text-muted)]">#{{ data.target_id }}</span>
            </div>
          </template>
        </Column>
        <Column field="ip_address" header="IP">
          <template #body="{ data }">
            <span class="font-mono text-xs">{{ data.ip_address || '—' }}</span>
          </template>
        </Column>
        <Column header="Details" style="width: 90px">
          <template #body="{ data }">
            <Button
              icon="pi pi-eye"
              severity="secondary"
              text
              rounded
              size="small"
              @click="showDetails(data)"
              v-tooltip.top="'View changes'"
            />
          </template>
        </Column>
      </DataTable>

      <Paginator
        :rows="pageSize"
        :totalRecords="store.auditLogsTotal"
        :rowsPerPageOptions="[25, 50, 100]"
        @page="onPage"
        class="mt-4"
      />
    </div>

    <!-- Details Dialog -->
    <Dialog
      v-model:visible="showDetailsDialog"
      header="Audit Entry"
      :style="{ width: '560px' }"
      modal
    >
      <div v-if="selectedLog" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Admin</div>
            <div class="text-sm">{{ selectedLog.admin_email || `#${selectedLog.admin_id}` }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Action</div>
            <div class="text-sm font-medium">{{ actionLabel(selectedLog.action) }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Target</div>
            <div class="flex items-center gap-2">
              <Tag :value="selectedLog.target_type" :severity="targetSeverity(selectedLog.target_type)" />
              <span class="text-sm">{{ selectedLog.target_name || (selectedLog.target_id ? `#${selectedLog.target_id}` : '—') }}</span>
            </div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">When</div>
            <div class="text-sm">{{ formatDate(selectedLog.created_at) }}</div>
          </div>
        </div>

        <div>
          <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Changes</div>
          <pre
            v-if="selectedLog.changes && Object.keys(selectedLog.changes).length"
            class="font-mono text-xs bg-[var(--color-surface-100)] p-3 rounded overflow-x-auto"
          >{{ JSON.stringify(selectedLog.changes, null, 2) }}</pre>
          <div v-else class="text-sm text-[var(--color-text-muted)]">No change payload recorded.</div>
        </div>
      </div>

      <template #footer>
        <Button label="Close" severity="secondary" @click="showDetailsDialog = false" />
      </template>
    </Dialog>
  </div>
</template>
