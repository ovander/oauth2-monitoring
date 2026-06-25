<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

import Card from 'primevue/card'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Checkbox from 'primevue/checkbox'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import Divider from 'primevue/divider'

import type { ReportRequest, ReportStatus } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()

const showGenerateDialog = ref(false)
const isGenerating = ref(false)
const pollingReports = ref<Set<string>>(new Set())

const reportForm = ref<{
  type: string
  format: string
  dateRange: Date[] | null
  sections: string[]
}>({
  type: 'security_summary',
  format: 'json',
  dateRange: [subDays(new Date(), 30), new Date()],
  sections: ['overview', 'threats', 'users', 'apps']
})

const reportTypes = [
  { label: 'Security Summary', value: 'security_summary' }
]

const formatOptions = [
  { label: 'JSON', value: 'json' },
  { label: 'CSV', value: 'csv' }
]

const sectionOptions = [
  { label: 'Overview', value: 'overview' },
  { label: 'Threats', value: 'threats' },
  { label: 'Users', value: 'users' },
  { label: 'Applications', value: 'apps' },
  { label: 'Recommendations', value: 'recommendations' }
]

const presetRanges = [
  { label: 'Last 7 Days', value: 'week' },
  { label: 'Last 30 Days', value: 'month' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Custom', value: 'custom' }
]

const selectedPreset = ref('month')

function applyPreset(preset: string) {
  selectedPreset.value = preset
  const now = new Date()
  
  switch (preset) {
    case 'week':
      reportForm.value.dateRange = [subDays(now, 7), now]
      break
    case 'month':
      reportForm.value.dateRange = [subDays(now, 30), now]
      break
    case 'this_month':
      reportForm.value.dateRange = [startOfMonth(now), now]
      break
    case 'last_month':
      const lastMonth = subDays(startOfMonth(now), 1)
      reportForm.value.dateRange = [startOfMonth(lastMonth), endOfMonth(lastMonth)]
      break
  }
}

function openGenerateDialog() {
  reportForm.value = {
    type: 'security_summary',
    format: 'json',
    dateRange: [subDays(new Date(), 30), new Date()],
    sections: ['overview', 'threats', 'users', 'apps']
  }
  selectedPreset.value = 'month'
  showGenerateDialog.value = true
}

async function generateReport() {
  if (!reportForm.value.dateRange || reportForm.value.dateRange.length !== 2) {
    toast.add({ severity: 'warn', summary: 'Validation', detail: 'Please select a date range', life: 3000 })
    return
  }

  isGenerating.value = true
  try {
    const dateRange = reportForm.value.dateRange
    const request: ReportRequest = {
      type: 'security_summary',
      period: {
        from: dateRange![0]!.toISOString(),
        to: dateRange![1]!.toISOString()
      },
      format: reportForm.value.format as 'json' | 'csv',
      sections: reportForm.value.sections
    }

    const report = await api.generateReport(request)
    toast.add({ severity: 'success', summary: 'Report Queued', detail: 'Your report is being generated', life: 3000 })
    showGenerateDialog.value = false
    
    // Start polling for completion
    pollReportStatus(report.report_id)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to generate report', life: 3000 })
  } finally {
    isGenerating.value = false
  }
}

async function pollReportStatus(reportId: string) {
  if (pollingReports.value.has(reportId)) return
  
  pollingReports.value.add(reportId)
  
  const poll = async () => {
    try {
      const status = await api.fetchReportStatus(reportId)
      
      if (status.status === 'completed') {
        pollingReports.value.delete(reportId)
        toast.add({ severity: 'success', summary: 'Report Ready', detail: 'Your report is ready for download', life: 5000 })
      } else if (status.status === 'failed') {
        pollingReports.value.delete(reportId)
        toast.add({ severity: 'error', summary: 'Report Failed', detail: status.error || 'Report generation failed', life: 5000 })
      } else {
        // Still generating, poll again in 2 seconds
        setTimeout(poll, 2000)
      }
    } catch (error) {
      pollingReports.value.delete(reportId)
    }
  }
  
  poll()
}

function downloadReport(report: ReportStatus) {
  if (report.status !== 'completed') return
  
  const url = api.getReportDownloadUrl(report.report_id)
  window.open(url, '_blank')
}

function getStatusSeverity(status: string): string {
  switch (status) {
    case 'completed': return 'success'
    case 'generating': return 'info'
    case 'failed': return 'danger'
    default: return 'secondary'
  }
}

function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

function toggleSection(section: string) {
  const idx = reportForm.value.sections.indexOf(section)
  if (idx >= 0) {
    reportForm.value.sections.splice(idx, 1)
  } else {
    reportForm.value.sections.push(section)
  }
}

onMounted(() => {
  // Load existing reports if API supports listing
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Security Reports</h1>
        <p class="text-[var(--color-text-muted)]">Generate and download security audit reports</p>
      </div>
      <Button 
        label="Generate Report" 
        icon="pi pi-plus"
        @click="openGenerateDialog"
      />
    </div>

    <!-- Report Templates -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      <!-- Security Summary -->
      <Card class="cursor-pointer hover:border-[var(--color-accent-primary)] transition-colors" @click="openGenerateDialog">
        <template #header>
          <div class="p-4 bg-gradient-to-br from-[var(--color-accent-primary)]/20 to-[var(--color-accent-cyan)]/10">
            <div class="w-12 h-12 rounded-lg bg-[var(--color-accent-primary)]/20 flex items-center justify-center">
              <i class="pi pi-shield text-2xl text-[var(--color-accent-primary)]"></i>
            </div>
          </div>
        </template>
        <template #title>Security Summary</template>
        <template #subtitle>Comprehensive security overview</template>
        <template #content>
          <p class="text-sm text-[var(--color-text-muted)]">
            Overview of security events, threats, user activity, and system health for a specified time period.
          </p>
          <div class="flex flex-wrap gap-1 mt-3">
            <Tag value="Events" severity="info" />
            <Tag value="Threats" severity="warning" />
            <Tag value="Users" severity="secondary" />
          </div>
        </template>
      </Card>

      <!-- Quick Reports -->
      <Card>
        <template #header>
          <div class="p-4 bg-gradient-to-br from-[var(--color-status-warning)]/20 to-[var(--color-status-warning)]/5">
            <div class="w-12 h-12 rounded-lg bg-[var(--color-status-warning)]/20 flex items-center justify-center">
              <i class="pi pi-clock text-2xl text-[var(--color-status-warning)]"></i>
            </div>
          </div>
        </template>
        <template #title>Quick Reports</template>
        <template #subtitle>Pre-configured report templates</template>
        <template #content>
          <div class="space-y-2">
            <Button 
              label="Last 7 Days Summary" 
              icon="pi pi-calendar" 
              severity="secondary" 
              outlined
              size="small"
              class="w-full justify-start"
              @click="applyPreset('week'); openGenerateDialog()"
            />
            <Button 
              label="This Month Summary" 
              icon="pi pi-calendar" 
              severity="secondary" 
              outlined
              size="small"
              class="w-full justify-start"
              @click="applyPreset('this_month'); openGenerateDialog()"
            />
            <Button 
              label="Last Month Summary" 
              icon="pi pi-calendar" 
              severity="secondary" 
              outlined
              size="small"
              class="w-full justify-start"
              @click="applyPreset('last_month'); openGenerateDialog()"
            />
          </div>
        </template>
      </Card>

      <!-- Export Data -->
      <Card>
        <template #header>
          <div class="p-4 bg-gradient-to-br from-[var(--color-status-secure)]/20 to-[var(--color-status-secure)]/5">
            <div class="w-12 h-12 rounded-lg bg-[var(--color-status-secure)]/20 flex items-center justify-center">
              <i class="pi pi-download text-2xl text-[var(--color-status-secure)]"></i>
            </div>
          </div>
        </template>
        <template #title>Export Formats</template>
        <template #subtitle>Available output formats</template>
        <template #content>
          <div class="space-y-3">
            <div class="flex items-center gap-3 p-2 bg-[var(--color-surface-100)] rounded">
              <i class="pi pi-file text-[var(--color-accent-primary)]"></i>
              <div>
                <div class="font-medium">JSON</div>
                <div class="text-xs text-[var(--color-text-muted)]">Structured data for integration</div>
              </div>
            </div>
            <div class="flex items-center gap-3 p-2 bg-[var(--color-surface-100)] rounded">
              <i class="pi pi-file-excel text-[var(--color-status-secure)]"></i>
              <div>
                <div class="font-medium">CSV</div>
                <div class="text-xs text-[var(--color-text-muted)]">Spreadsheet compatible</div>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- Report History -->
    <div class="panel">
      <div class="panel-header">
        <i class="pi pi-history text-[var(--color-accent-secondary)]"></i>
        Recent Reports
      </div>
      
      <DataTable 
        v-if="store.reports.length > 0"
        :value="store.reports"
        class="data-table"
        stripedRows
      >
        <Column field="report_id" header="Report ID">
          <template #body="{ data }">
            <span class="font-mono text-sm">{{ data.report_id }}</span>
          </template>
        </Column>
        <Column field="type" header="Type">
          <template #body="{ data }">
            <span class="capitalize">{{ data.type?.replace(/_/g, ' ') || 'Security Summary' }}</span>
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <ProgressSpinner 
                v-if="data.status === 'generating'" 
                style="width: 16px; height: 16px"
                strokeWidth="4"
              />
              <Tag 
                :value="data.status.toUpperCase()" 
                :severity="getStatusSeverity(data.status)" 
              />
            </div>
          </template>
        </Column>
        <Column field="created_at" header="Created">
          <template #body="{ data }">
            <span class="text-sm">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>
        <Column header="Actions" style="width: 120px">
          <template #body="{ data }">
            <Button 
              v-if="data.status === 'completed'"
              icon="pi pi-download" 
              severity="success" 
              text 
              rounded
              @click="downloadReport(data)"
              v-tooltip.left="'Download'"
            />
            <span v-else-if="data.status === 'generating'" class="text-sm text-[var(--color-text-muted)]">
              Processing...
            </span>
            <span v-else class="text-sm text-[var(--color-status-danger)]">
              Failed
            </span>
          </template>
        </Column>
      </DataTable>
      
      <div v-else class="text-center py-12 text-[var(--color-text-muted)]">
        <i class="pi pi-file text-4xl mb-3"></i>
        <p>No reports generated yet</p>
        <p class="text-sm mt-1">Click "Generate Report" to create your first report</p>
      </div>
    </div>

    <!-- Generate Report Dialog -->
    <Dialog 
      v-model:visible="showGenerateDialog" 
      header="Generate Security Report"
      :style="{ width: '550px' }"
      modal
    >
      <div class="space-y-5">
        <!-- Report Type -->
        <div>
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Report Type
          </label>
          <Select 
            v-model="reportForm.type" 
            :options="reportTypes"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>

        <!-- Date Range Presets -->
        <div>
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Time Period
          </label>
          <div class="flex flex-wrap gap-2 mb-3">
            <Button 
              v-for="preset in presetRanges"
              :key="preset.value"
              :label="preset.label"
              size="small"
              :severity="selectedPreset === preset.value ? 'primary' : 'secondary'"
              :outlined="selectedPreset !== preset.value"
              @click="applyPreset(preset.value)"
            />
          </div>
          <div class="flex gap-2">
            <DatePicker 
              v-model="reportForm.dateRange" 
              selectionMode="range"
              :manualInput="false"
              dateFormat="yy-mm-dd"
              class="flex-1"
              placeholder="Select date range"
              @date-select="selectedPreset = 'custom'"
            />
          </div>
        </div>

        <Divider />

        <!-- Format -->
        <div>
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Output Format
          </label>
          <div class="flex gap-3">
            <div 
              v-for="fmt in formatOptions" 
              :key="fmt.value"
              class="flex-1 p-3 rounded-lg border cursor-pointer transition-all"
              :class="reportForm.format === fmt.value 
                ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10' 
                : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border)]'"
              @click="reportForm.format = fmt.value"
            >
              <div class="flex items-center gap-2">
                <i :class="['pi', fmt.value === 'json' ? 'pi-file' : 'pi-file-excel']"></i>
                <span class="font-medium">{{ fmt.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sections -->
        <div>
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Include Sections
          </label>
          <div class="grid grid-cols-2 gap-2">
            <div 
              v-for="section in sectionOptions" 
              :key="section.value"
              class="flex items-center gap-2"
            >
              <Checkbox 
                :modelValue="reportForm.sections.includes(section.value)"
                @update:modelValue="toggleSection(section.value)"
                :inputId="'section-' + section.value"
                binary
              />
              <label :for="'section-' + section.value" class="cursor-pointer text-sm">
                {{ section.label }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button 
          label="Cancel" 
          severity="secondary"
          @click="showGenerateDialog = false"
        />
        <Button 
          label="Generate Report" 
          icon="pi pi-file"
          @click="generateReport"
          :loading="isGenerating"
          :disabled="!reportForm.dateRange || reportForm.sections.length === 0"
        />
      </template>
    </Dialog>
  </div>
</template>
