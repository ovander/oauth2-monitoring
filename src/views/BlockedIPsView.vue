<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { format, formatDistanceToNow } from 'date-fns'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Message from 'primevue/message'

import type { BlockedIP, IPReputation } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()
const confirm = useConfirm()

const showBlockDialog = ref(false)
const showReputationDialog = ref(false)
const isBlocking = ref(false)

const newBlock = ref({
  ip_address: '',
  reason: '',
  duration_hours: 24,
  permanent: false
})

const selectedIP = ref<string | null>(null)
const ipReputation = ref<IPReputation | null>(null)
const loadingReputation = ref(false)

async function loadBlockedIPs() {
  try {
    await api.fetchBlockedIPs()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load blocked IPs', life: 3000 })
  }
}

function openBlockDialog() {
  newBlock.value = {
    ip_address: '',
    reason: '',
    duration_hours: 24,
    permanent: false
  }
  showBlockDialog.value = true
}

async function blockIP() {
  if (!newBlock.value.ip_address) {
    toast.add({ severity: 'warn', summary: 'Validation', detail: 'IP address is required', life: 3000 })
    return
  }

  isBlocking.value = true
  try {
    await api.blockIP({
      ip_address: newBlock.value.ip_address,
      reason: newBlock.value.reason || 'Manually blocked',
      duration_hours: newBlock.value.permanent ? undefined : newBlock.value.duration_hours,
      permanent: newBlock.value.permanent
    })
    toast.add({ severity: 'success', summary: 'IP Blocked', detail: `${newBlock.value.ip_address} has been blocked`, life: 3000 })
    showBlockDialog.value = false
    loadBlockedIPs()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to block IP', life: 3000 })
  } finally {
    isBlocking.value = false
  }
}

async function unblockIP(ip: BlockedIP) {
  confirm.require({
    message: `Unblock IP address ${ip.ip_address}?`,
    header: 'Confirm Unblock',
    icon: 'pi pi-question-circle',
    acceptClass: 'p-button-success',
    accept: async () => {
      try {
        await api.unblockIP(ip.id)
        toast.add({ severity: 'success', summary: 'IP Unblocked', detail: `${ip.ip_address} has been unblocked`, life: 3000 })
        loadBlockedIPs()
      } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to unblock IP', life: 3000 })
      }
    }
  })
}

async function viewReputation(ip: string) {
  selectedIP.value = ip
  loadingReputation.value = true
  showReputationDialog.value = true
  
  try {
    ipReputation.value = await api.fetchIPReputation(ip)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load IP reputation', life: 3000 })
    showReputationDialog.value = false
  } finally {
    loadingReputation.value = false
  }
}

function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

function formatRelative(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

function isExpired(ip: BlockedIP): boolean {
  if (ip.permanent || !ip.expires_at) return false
  return new Date(ip.expires_at) < new Date()
}

onMounted(() => {
  loadBlockedIPs()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Blocked IPs</h1>
        <p class="text-[var(--color-text-muted)]">Manage IP address blocking and reputation</p>
      </div>
      <div class="flex items-center gap-2">
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadBlockedIPs"
          :loading="store.isLoading['blockedIPs']"
        />
        <Button 
          label="Block IP" 
          icon="pi pi-plus"
          @click="openBlockDialog"
        />
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="metric-card" style="--card-accent: #ef4444">
        <div class="metric-value text-[var(--color-status-danger)]">
          {{ store.blockedIPs.length }}
        </div>
        <div class="metric-label">Total Blocked</div>
      </div>
      <div class="metric-card" style="--card-accent: #8b5cf6">
        <div class="metric-value text-[var(--color-accent-secondary)]">
          {{ store.blockedIPs.filter(ip => ip.permanent).length }}
        </div>
        <div class="metric-label">Permanent Blocks</div>
      </div>
      <div class="metric-card" style="--card-accent: #f59e0b">
        <div class="metric-value text-[var(--color-status-warning)]">
          {{ store.blockedIPs.filter(ip => !ip.permanent && ip.expires_at).length }}
        </div>
        <div class="metric-label">Temporary Blocks</div>
      </div>
    </div>

    <!-- Blocked IPs Table -->
    <div class="panel">
      <DataTable 
        :value="store.blockedIPs"
        :loading="store.isLoading['blockedIPs']"
        class="data-table"
        stripedRows
        :rowHover="true"
        emptyMessage="No blocked IPs"
      >
        <Column field="ip_address" header="IP Address" style="width: 160px">
          <template #body="{ data }">
            <button 
              class="font-mono font-medium text-[var(--color-accent-primary)] hover:underline"
              @click="viewReputation(data.ip_address)"
            >
              {{ data.ip_address }}
            </button>
          </template>
        </Column>
        <Column field="reason" header="Reason">
          <template #body="{ data }">
            <span class="text-sm">{{ data.reason || '-' }}</span>
          </template>
        </Column>
        <Column field="permanent" header="Type" style="width: 120px">
          <template #body="{ data }">
            <Tag 
              :value="data.permanent ? 'Permanent' : 'Temporary'" 
              :severity="data.permanent ? 'danger' : 'warning'" 
            />
          </template>
        </Column>
        <Column field="blocked_at" header="Blocked At" style="width: 180px">
          <template #body="{ data }">
            <div class="text-sm">{{ formatDate(data.blocked_at) }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">{{ formatRelative(data.blocked_at) }}</div>
          </template>
        </Column>
        <Column field="expires_at" header="Expires" style="width: 180px">
          <template #body="{ data }">
            <template v-if="data.permanent">
              <span class="text-[var(--color-text-muted)]">Never</span>
            </template>
            <template v-else-if="data.expires_at">
              <div class="text-sm" :class="{ 'text-[var(--color-status-secure)]': isExpired(data) }">
                {{ formatDate(data.expires_at) }}
              </div>
              <div class="text-xs text-[var(--color-text-muted)]">
                {{ isExpired(data) ? 'Expired' : formatRelative(data.expires_at) }}
              </div>
            </template>
            <template v-else>-</template>
          </template>
        </Column>
        <Column field="blocked_by_email" header="Blocked By" style="width: 180px">
          <template #body="{ data }">
            <span class="text-sm">{{ data.blocked_by_email || 'System' }}</span>
          </template>
        </Column>
        <Column header="Actions" style="width: 100px">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button 
                icon="pi pi-eye" 
                severity="secondary" 
                text 
                rounded
                size="small"
                @click="viewReputation(data.ip_address)"
                v-tooltip.left="'View Reputation'"
              />
              <Button 
                icon="pi pi-unlock" 
                severity="success" 
                text 
                rounded
                size="small"
                @click="unblockIP(data)"
                v-tooltip.left="'Unblock'"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Block IP Dialog -->
    <Dialog 
      v-model:visible="showBlockDialog" 
      header="Block IP Address"
      :style="{ width: '450px' }"
      modal
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            IP Address <span class="text-[var(--color-status-danger)]">*</span>
          </label>
          <IconField>
            <InputIcon class="pi pi-globe" />
            <InputText 
              v-model="newBlock.ip_address" 
              placeholder="192.168.1.100"
              class="w-full"
            />
          </IconField>
        </div>

        <div>
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Reason
          </label>
          <Textarea 
            v-model="newBlock.reason" 
            placeholder="Reason for blocking..."
            rows="3"
            class="w-full"
          />
        </div>

        <div class="flex items-center gap-2">
          <Checkbox 
            v-model="newBlock.permanent" 
            inputId="permanent"
            binary
          />
          <label for="permanent" class="cursor-pointer">Permanent block</label>
        </div>

        <div v-if="!newBlock.permanent">
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Duration (hours)
          </label>
          <InputNumber 
            v-model="newBlock.duration_hours" 
            :min="1"
            :max="8760"
            class="w-full"
          />
        </div>

        <Message severity="warn" :closable="false" v-if="newBlock.permanent">
          <small>Permanent blocks must be manually removed.</small>
        </Message>
      </div>

      <template #footer>
        <Button 
          label="Cancel" 
          severity="secondary"
          @click="showBlockDialog = false"
        />
        <Button 
          label="Block IP" 
          icon="pi pi-ban"
          severity="danger"
          @click="blockIP"
          :loading="isBlocking"
        />
      </template>
    </Dialog>

    <!-- IP Reputation Dialog -->
    <Dialog 
      v-model:visible="showReputationDialog" 
      :header="`IP Reputation: ${selectedIP}`"
      :style="{ width: '500px' }"
      modal
    >
      <div v-if="loadingReputation" class="flex justify-center py-8">
        <i class="pi pi-spin pi-spinner text-3xl"></i>
      </div>
      <div v-else-if="ipReputation" class="space-y-4">
        <!-- Risk Score -->
        <div class="text-center py-4 bg-[var(--color-surface-100)] rounded-lg">
          <div class="text-5xl font-bold font-mono" :class="{
            'text-[var(--color-status-danger)]': ipReputation.risk_score >= 80,
            'text-[var(--color-status-warning)]': ipReputation.risk_score >= 50 && ipReputation.risk_score < 80,
            'text-[var(--color-status-secure)]': ipReputation.risk_score < 50
          }">
            {{ ipReputation.risk_score }}
          </div>
          <div class="text-sm text-[var(--color-text-muted)]">Risk Score (0-100)</div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="p-3 bg-[var(--color-surface-100)] rounded-lg text-center">
            <div class="text-2xl font-bold">{{ ipReputation.events_24h }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Events (24h)</div>
          </div>
          <div class="p-3 bg-[var(--color-surface-100)] rounded-lg text-center">
            <div class="text-2xl font-bold">{{ ipReputation.events_7d }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Events (7d)</div>
          </div>
          <div class="p-3 bg-[var(--color-surface-100)] rounded-lg text-center">
            <div class="text-2xl font-bold text-[var(--color-status-danger)]">{{ ipReputation.failed_logins_24h }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Failed Logins (24h)</div>
          </div>
          <div class="p-3 bg-[var(--color-surface-100)] rounded-lg text-center">
            <div class="text-2xl font-bold">{{ ipReputation.unique_users_targeted }}</div>
            <div class="text-xs text-[var(--color-text-muted)]">Users Targeted</div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between p-2 bg-[var(--color-surface-100)] rounded">
            <span class="text-[var(--color-text-muted)]">First Seen</span>
            <span class="font-mono text-sm">{{ formatDate(ipReputation.first_seen) }}</span>
          </div>
          <div class="flex justify-between p-2 bg-[var(--color-surface-100)] rounded">
            <span class="text-[var(--color-text-muted)]">Last Seen</span>
            <span class="font-mono text-sm">{{ formatDate(ipReputation.last_seen) }}</span>
          </div>
          <div class="flex justify-between p-2 bg-[var(--color-surface-100)] rounded">
            <span class="text-[var(--color-text-muted)]">Status</span>
            <Tag 
              :value="ipReputation.is_blocked ? 'BLOCKED' : 'ACTIVE'" 
              :severity="ipReputation.is_blocked ? 'danger' : 'success'" 
            />
          </div>
        </div>

        <!-- Recent Events -->
        <div v-if="ipReputation.recent_events?.length">
          <div class="text-sm font-medium text-[var(--color-text-secondary)] mb-2">Recent Events</div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div 
              v-for="(event, idx) in ipReputation.recent_events.slice(0, 5)" 
              :key="idx"
              class="flex justify-between p-2 bg-[var(--color-surface-100)] rounded text-sm"
            >
              <span>{{ event.event_type }}</span>
              <span class="text-[var(--color-text-muted)]">{{ formatRelative(event.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button 
          label="Close" 
          severity="secondary"
          @click="showReputationDialog = false"
        />
      </template>
    </Dialog>
  </div>
</template>
