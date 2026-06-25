<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { format, formatDistanceToNow } from 'date-fns'

import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import MultiSelect from 'primevue/multiselect'
import Message from 'primevue/message'
import ConfirmPopup from 'primevue/confirmpopup'

import type { AlertRule, TriggeredAlert, Severity } from '@/types'
import { EVENT_TYPE_LABELS } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()
const confirm = useConfirm()

// Dialog states
const showRuleDialog = ref(false)
const showAcknowledgeDialog = ref(false)
const isEditingRule = ref(false)
const selectedAlert = ref<TriggeredAlert | null>(null)
const acknowledgeNote = ref('')

// Rule form
const ruleForm = ref<Partial<AlertRule>>({
  name: '',
  description: '',
  event_type: '',
  condition: { threshold: 5, window_minutes: 5 },
  severity: 'warning',
  enabled: true,
  actions: ['email']
})

const severityOptions = [
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Critical', value: 'critical' }
]

const actionOptions = [
  { label: 'Email', value: 'email' },
  { label: 'Webhook', value: 'webhook' },
  { label: 'Slack', value: 'slack' }
]

const groupByOptions = [
  { label: 'None', value: undefined },
  { label: 'IP Address', value: 'ip_address' },
  { label: 'User ID', value: 'user_id' },
  { label: 'Application ID', value: 'app_id' }
]

const eventTypeOptions = computed(() => 
  Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))
)

// History filters
const historyFilters = ref({
  severity: null as Severity | null,
  acknowledged: null as boolean | null
})

async function loadData() {
  try {
    await Promise.all([
      api.fetchAlertRules(),
      api.fetchAlertHistory({
        severity: historyFilters.value.severity || undefined,
        acknowledged: historyFilters.value.acknowledged ?? undefined
      })
    ])
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load alert data', life: 3000 })
  }
}

function openNewRuleDialog() {
  isEditingRule.value = false
  ruleForm.value = {
    name: '',
    description: '',
    event_type: '',
    condition: { threshold: 5, window_minutes: 5 },
    severity: 'warning',
    enabled: true,
    actions: ['email']
  }
  showRuleDialog.value = true
}

function openEditRuleDialog(rule: AlertRule) {
  isEditingRule.value = true
  ruleForm.value = { ...rule, condition: { ...rule.condition } }
  showRuleDialog.value = true
}

async function saveRule() {
  try {
    if (isEditingRule.value && ruleForm.value.id) {
      await api.updateAlertRule(ruleForm.value.id, ruleForm.value)
      toast.add({ severity: 'success', summary: 'Success', detail: 'Alert rule updated', life: 3000 })
    } else {
      await api.createAlertRule(ruleForm.value as any)
      toast.add({ severity: 'success', summary: 'Success', detail: 'Alert rule created', life: 3000 })
    }
    showRuleDialog.value = false
    await loadData()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save alert rule', life: 3000 })
  }
}

function confirmDeleteRule(event: Event, rule: AlertRule) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: `Delete "${rule.name}"?`,
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-secondary p-button-text',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.deleteAlertRule(rule.id)
        toast.add({ severity: 'success', summary: 'Success', detail: 'Alert rule deleted', life: 3000 })
        await loadData()
      } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete rule', life: 3000 })
      }
    }
  })
}

async function toggleRuleEnabled(rule: AlertRule) {
  try {
    await api.updateAlertRule(rule.id, { enabled: !rule.enabled })
    rule.enabled = !rule.enabled
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update rule', life: 3000 })
  }
}

function openAcknowledgeDialog(alert: TriggeredAlert) {
  selectedAlert.value = alert
  acknowledgeNote.value = ''
  showAcknowledgeDialog.value = true
}

async function acknowledgeAlert() {
  if (!selectedAlert.value) return
  
  try {
    await api.acknowledgeAlert(selectedAlert.value.id, acknowledgeNote.value)
    toast.add({ severity: 'success', summary: 'Success', detail: 'Alert acknowledged', life: 3000 })
    showAcknowledgeDialog.value = false
    await loadData()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to acknowledge alert', life: 3000 })
  }
}

function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'critical': return 'danger'
    case 'error': return 'danger'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

function formatTime(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <ConfirmPopup />
    
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Alerts</h1>
        <p class="text-[var(--color-text-muted)]">Configure and manage security alerts</p>
      </div>
      <div class="flex items-center gap-3">
        <Tag 
          v-if="store.unacknowledgedAlerts > 0"
          :value="`${store.unacknowledgedAlerts} unacknowledged`"
          severity="danger"
        />
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadData"
          :loading="store.isLoading['alertRules'] || store.isLoading['alertHistory']"
        />
      </div>
    </div>

    <!-- Unacknowledged Alerts Banner -->
    <Message v-if="store.unacknowledgedAlerts > 0" severity="warn" :closable="false" class="mb-6">
      <div class="flex items-center justify-between w-full">
        <span>
          <i class="pi pi-exclamation-triangle mr-2"></i>
          You have {{ store.unacknowledgedAlerts }} unacknowledged alert(s) that require attention.
        </span>
      </div>
    </Message>

    <Tabs value="0">
      <TabList>
        <Tab value="0">Alert Rules</Tab>
        <Tab value="1">Alert History</Tab>
      </TabList>
      <TabPanels>
        <!-- Alert Rules Tab -->
        <TabPanel value="0">
        <div class="mb-4 flex justify-end">
          <Button 
            label="New Rule" 
            icon="pi pi-plus" 
            @click="openNewRuleDialog"
          />
        </div>

        <DataTable 
          :value="store.alertRules"
          :loading="store.isLoading['alertRules']"
          class="data-table"
          stripedRows
          :rowHover="true"
        >
          <Column field="name" header="Rule Name">
            <template #body="{ data }">
              <div>
                <div class="font-medium">{{ data.name }}</div>
                <div class="text-xs text-[var(--color-text-muted)] mt-1">{{ data.description }}</div>
              </div>
            </template>
          </Column>
          <Column field="event_type" header="Event Type">
            <template #body="{ data }">
              <Tag :value="EVENT_TYPE_LABELS[data.event_type] || data.event_type" severity="info" />
            </template>
          </Column>
          <Column field="condition" header="Condition">
            <template #body="{ data }">
              <span class="font-mono text-sm">
                ≥ {{ data.condition.threshold }} in {{ data.condition.window_minutes }}m
                <span v-if="data.condition.group_by" class="text-[var(--color-text-muted)]">
                  (by {{ data.condition.group_by }})
                </span>
              </span>
            </template>
          </Column>
          <Column field="severity" header="Severity">
            <template #body="{ data }">
              <Tag :value="data.severity.toUpperCase()" :severity="getSeverityColor(data.severity)" />
            </template>
          </Column>
          <Column field="enabled" header="Status">
            <template #body="{ data }">
              <Tag 
                :value="data.enabled ? 'Active' : 'Disabled'" 
                :severity="data.enabled ? 'success' : 'secondary'"
                class="cursor-pointer"
                @click="toggleRuleEnabled(data)"
              />
            </template>
          </Column>
          <Column header="Actions" style="width: 120px">
            <template #body="{ data }">
              <div class="flex gap-1">
                <Button 
                  icon="pi pi-pencil" 
                  severity="secondary" 
                  text 
                  rounded
                  size="small"
                  @click="openEditRuleDialog(data)"
                />
                <Button 
                  icon="pi pi-trash" 
                  severity="danger" 
                  text 
                  rounded
                  size="small"
                  @click="confirmDeleteRule($event, data)"
                />
              </div>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-[var(--color-text-muted)]">
              <i class="pi pi-bell text-3xl mb-2"></i>
              <p>No alert rules configured</p>
              <Button 
                label="Create First Rule" 
                icon="pi pi-plus"
                class="mt-4"
                @click="openNewRuleDialog"
              />
            </div>
          </template>
        </DataTable>
        </TabPanel>

        <!-- Alert History Tab -->
        <TabPanel value="1">
        <div class="mb-4 flex items-center gap-4">
          <Select 
            v-model="historyFilters.severity"
            :options="[{ label: 'All Severities', value: null }, ...severityOptions]"
            optionLabel="label"
            optionValue="value"
            placeholder="Severity"
            class="w-40"
            @change="loadData"
          />
          <Select 
            v-model="historyFilters.acknowledged"
            :options="[
              { label: 'All', value: null },
              { label: 'Unacknowledged', value: false },
              { label: 'Acknowledged', value: true }
            ]"
            optionLabel="label"
            optionValue="value"
            placeholder="Status"
            class="w-40"
            @change="loadData"
          />
        </div>

        <DataTable 
          :value="store.alertHistory"
          :loading="store.isLoading['alertHistory']"
          class="data-table"
          stripedRows
          :rowHover="true"
        >
          <Column field="triggered_at" header="Time">
            <template #body="{ data }">
              <div>
                <div class="text-sm">{{ formatTime(data.triggered_at) }}</div>
                <div class="text-xs text-[var(--color-text-muted)]">
                  {{ format(new Date(data.triggered_at), 'MMM d, HH:mm') }}
                </div>
              </div>
            </template>
          </Column>
          <Column field="severity" header="Severity">
            <template #body="{ data }">
              <Tag :value="data.severity.toUpperCase()" :severity="getSeverityColor(data.severity)" />
            </template>
          </Column>
          <Column field="rule_name" header="Rule">
            <template #body="{ data }">
              <span class="font-medium">{{ data.rule_name }}</span>
            </template>
          </Column>
          <Column field="message" header="Message">
            <template #body="{ data }">
              <div class="max-w-md">
                <div class="text-sm">{{ data.message }}</div>
                <div v-if="data.details?.ip_address" class="text-xs text-[var(--color-text-muted)] mt-1">
                  IP: {{ data.details.ip_address }}
                </div>
              </div>
            </template>
          </Column>
          <Column field="acknowledged" header="Status">
            <template #body="{ data }">
              <div v-if="data.acknowledged" class="text-sm">
                <Tag value="Acknowledged" severity="success" />
                <div class="text-xs text-[var(--color-text-muted)] mt-1">
                  {{ formatTime(data.acknowledged_at) }}
                </div>
              </div>
              <Tag v-else value="Pending" severity="warning" />
            </template>
          </Column>
          <Column header="Action" style="width: 100px">
            <template #body="{ data }">
              <Button 
                v-if="!data.acknowledged"
                label="Ack"
                icon="pi pi-check"
                size="small"
                @click="openAcknowledgeDialog(data)"
              />
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-[var(--color-text-muted)]">
              <i class="pi pi-check-circle text-3xl mb-2 text-[var(--color-status-secure)]"></i>
              <p>No alerts in history</p>
            </div>
          </template>
        </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- Rule Dialog -->
    <Dialog 
      v-model:visible="showRuleDialog" 
      :header="isEditingRule ? 'Edit Alert Rule' : 'New Alert Rule'"
      :style="{ width: '550px' }"
      modal
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Rule Name</label>
          <InputText v-model="ruleForm.name" class="w-full" placeholder="e.g., Brute Force Detection" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <Textarea v-model="ruleForm.description" class="w-full" rows="2" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Event Type</label>
          <Select 
            v-model="ruleForm.event_type"
            :options="eventTypeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select event type"
            class="w-full"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Threshold</label>
            <InputNumber v-model="ruleForm.condition!.threshold" class="w-full" :min="1" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Window (minutes)</label>
            <InputNumber v-model="ruleForm.condition!.window_minutes" class="w-full" :min="1" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Group By</label>
          <Select 
            v-model="ruleForm.condition!.group_by"
            :options="groupByOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Optional grouping"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Severity</label>
          <Select 
            v-model="ruleForm.severity"
            :options="severityOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Actions</label>
          <MultiSelect 
            v-model="ruleForm.actions"
            :options="actionOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select actions"
            class="w-full"
          />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="ruleForm.enabled" inputId="enabled" binary />
          <label for="enabled">Enable this rule</label>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showRuleDialog = false" />
        <Button 
          :label="isEditingRule ? 'Update' : 'Create'"
          icon="pi pi-check"
          @click="saveRule"
          :disabled="!ruleForm.name || !ruleForm.event_type"
        />
      </template>
    </Dialog>

    <!-- Acknowledge Dialog -->
    <Dialog 
      v-model:visible="showAcknowledgeDialog" 
      header="Acknowledge Alert"
      :style="{ width: '450px' }"
      modal
    >
      <div v-if="selectedAlert" class="space-y-4">
        <div class="p-3 rounded-lg bg-[var(--color-surface-100)]">
          <div class="flex items-center gap-2 mb-2">
            <Tag :value="selectedAlert.severity.toUpperCase()" :severity="getSeverityColor(selectedAlert.severity)" />
            <span class="font-medium">{{ selectedAlert.rule_name }}</span>
          </div>
          <p class="text-sm text-[var(--color-text-secondary)]">{{ selectedAlert.message }}</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Acknowledgment Note (optional)</label>
          <Textarea 
            v-model="acknowledgeNote" 
            class="w-full" 
            rows="3" 
            placeholder="Add notes about investigation or resolution..."
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showAcknowledgeDialog = false" />
        <Button 
          label="Acknowledge"
          icon="pi pi-check"
          @click="acknowledgeAlert"
        />
      </template>
    </Dialog>
  </div>
</template>
