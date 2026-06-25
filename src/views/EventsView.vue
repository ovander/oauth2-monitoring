<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { format } from 'date-fns'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import MultiSelect from 'primevue/multiselect'

import { EVENT_TYPE_LABELS, SEVERITY_LABELS } from '@/types'
import type { SecurityEvent, Severity } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()

// Filters
const filters = ref({
  event_type: [] as string[],
  severity: [] as Severity[],
  ip_address: '',
  user_email: '',
  from: null as Date | null,
  to: null as Date | null
})

const page = ref(1)
const pageSize = ref(20)
const selectedEvent = ref<SecurityEvent | null>(null)
const showDetailDialog = ref(false)

const eventTypeOptions = computed(() => 
  Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))
)

const severityOptions = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' }
]

async function loadEvents() {
  try {
    await api.fetchSecurityEvents({
      event_type: filters.value.event_type.join(',') || undefined,
      severity: filters.value.severity.join(',') || undefined,
      ip_address: filters.value.ip_address || undefined,
      from: filters.value.from?.toISOString(),
      to: filters.value.to?.toISOString(),
      page: page.value,
      page_size: pageSize.value
    })
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load events', life: 3000 })
  }
}

function onPage(event: any) {
  page.value = event.page + 1
  pageSize.value = event.rows
  loadEvents()
}

function clearFilters() {
  filters.value = {
    event_type: [],
    severity: [],
    ip_address: '',
    user_email: '',
    from: null,
    to: null
  }
  page.value = 1
  loadEvents()
}

function showDetails(event: SecurityEvent) {
  selectedEvent.value = event
  showDetailDialog.value = true
}

function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'critical': return 'danger'
    case 'error': return 'danger'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm:ss')
}

onMounted(() => {
  loadEvents()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Security Events</h1>
        <p class="text-[var(--color-text-muted)]">Browse and filter security audit logs</p>
      </div>
      <div class="flex items-center gap-2">
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadEvents"
          :loading="store.isLoading['events']"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="panel mb-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Event Type</label>
          <MultiSelect 
            v-model="filters.event_type" 
            :options="eventTypeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="All Types"
            class="w-full"
            :maxSelectedLabels="2"
          />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Severity</label>
          <MultiSelect 
            v-model="filters.severity" 
            :options="severityOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="All Severities"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">IP Address</label>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="filters.ip_address" placeholder="Filter by IP" class="w-full" />
          </IconField>
        </div>
        <div>
          <label class="block text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Date Range</label>
          <div class="flex gap-2">
            <DatePicker v-model="filters.from" placeholder="From" class="flex-1" dateFormat="yy-mm-dd" />
            <DatePicker v-model="filters.to" placeholder="To" class="flex-1" dateFormat="yy-mm-dd" />
          </div>
        </div>
      </div>
      <div class="flex justify-end mt-4 gap-2">
        <Button label="Clear" severity="secondary" text @click="clearFilters" />
        <Button label="Apply Filters" icon="pi pi-filter" @click="loadEvents" />
      </div>
    </div>

    <!-- Events Table -->
    <div class="panel">
      <DataTable 
        :value="store.securityEvents"
        :loading="store.isLoading['events']"
        :paginator="true"
        :rows="pageSize"
        :totalRecords="store.securityEventsTotal"
        :lazy="true"
        @page="onPage"
        :rowsPerPageOptions="[10, 20, 50, 100]"
        class="data-table"
        stripedRows
        :rowHover="true"
        @rowClick="(e) => showDetails(e.data)"
        style="cursor: pointer"
      >
        <Column field="created_at" header="Time" style="width: 180px">
          <template #body="{ data }">
            <span class="font-mono text-xs">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>
        <Column field="severity" header="Severity" style="width: 100px">
          <template #body="{ data }">
            <Tag :value="data.severity.toUpperCase()" :severity="getSeverityColor(data.severity)" />
          </template>
        </Column>
        <Column field="event_type" header="Event">
          <template #body="{ data }">
            <span class="font-medium">{{ EVENT_TYPE_LABELS[data.event_type] || data.event_type }}</span>
          </template>
        </Column>
        <Column field="user_email" header="User" style="width: 200px">
          <template #body="{ data }">
            <span class="text-sm">{{ data.user_email || '-' }}</span>
          </template>
        </Column>
        <Column field="ip_address" header="IP Address" style="width: 140px">
          <template #body="{ data }">
            <span class="font-mono text-sm">{{ data.ip_address }}</span>
          </template>
        </Column>
        <Column field="success" header="Status" style="width: 80px">
          <template #body="{ data }">
            <i 
              :class="[
                'pi',
                data.success ? 'pi-check-circle text-[var(--color-status-secure)]' : 'pi-times-circle text-[var(--color-status-danger)]'
              ]"
            ></i>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Detail Dialog -->
    <Dialog 
      v-model:visible="showDetailDialog" 
      header="Event Details" 
      :style="{ width: '600px' }"
      modal
    >
      <div v-if="selectedEvent" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase">Event Type</div>
            <div class="font-medium">{{ EVENT_TYPE_LABELS[selectedEvent.event_type] }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase">Severity</div>
            <Tag :value="selectedEvent.severity.toUpperCase()" :severity="getSeverityColor(selectedEvent.severity)" />
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase">Time</div>
            <div class="font-mono text-sm">{{ formatDate(selectedEvent.created_at) }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase">Status</div>
            <div>{{ selectedEvent.success ? 'Success' : 'Failed' }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase">IP Address</div>
            <div class="font-mono">{{ selectedEvent.ip_address }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase">User</div>
            <div>{{ selectedEvent.user_email || 'N/A' }}</div>
          </div>
        </div>
        <div v-if="selectedEvent.correlation_id">
          <div class="text-xs text-[var(--color-text-muted)] uppercase">Correlation ID</div>
          <div class="font-mono text-xs bg-[var(--color-surface-100)] p-2 rounded mt-1 break-all">
            {{ selectedEvent.correlation_id }}
          </div>
        </div>
        <div v-if="selectedEvent.user_agent">
          <div class="text-xs text-[var(--color-text-muted)] uppercase">User Agent</div>
          <div class="font-mono text-xs bg-[var(--color-surface-100)] p-2 rounded mt-1 break-all">
            {{ selectedEvent.user_agent }}
          </div>
        </div>
        <div v-if="selectedEvent.details">
          <div class="text-xs text-[var(--color-text-muted)] uppercase">Details</div>
          <pre class="font-mono text-xs bg-[var(--color-surface-100)] p-3 rounded mt-1 overflow-auto max-h-48">{{ JSON.stringify(selectedEvent.details, null, 2) }}</pre>
        </div>
      </div>
    </Dialog>
  </div>
</template>
