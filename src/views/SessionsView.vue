<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitorStore'
import { useApi } from '@/composables/useApi'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { format, formatDistanceToNow } from 'date-fns'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Paginator from 'primevue/paginator'
import ConfirmPopup from 'primevue/confirmpopup'

import type { Session } from '@/types'

const store = useMonitorStore()
const api = useApi()
const toast = useToast()
const confirm = useConfirm()

const filters = ref({
  search: ''
})

const page = ref(1)
const pageSize = ref(20)
const selectedSessions = ref<Session[]>([])
const showDetailsDialog = ref(false)
const selectedSession = ref<Session | null>(null)

async function loadSessions() {
  try {
    await api.fetchSessions({
      page: page.value,
      page_size: pageSize.value
    })
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load sessions', life: 3000 })
  }
}

function onPage(event: any) {
  page.value = event.page + 1
  pageSize.value = event.rows
  loadSessions()
}

function showDetails(session: Session) {
  selectedSession.value = session
  showDetailsDialog.value = true
}

// Sessions are derived from the audit log; Socrate revokes at the user level.
// Revoking a session therefore revokes ALL of that user's tokens, signing them
// out of every application at once.
async function revokeSession(session: Session) {
  try {
    await api.revokeUserTokens(session.user_id)
    toast.add({ severity: 'success', summary: 'Success', detail: `All tokens revoked for ${session.user_email}`, life: 3000 })
    loadSessions()
    showDetailsDialog.value = false
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke user tokens', life: 3000 })
  }
}

function confirmRevoke(event: Event, session: Session) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: `Revoke all tokens for ${session.user_email}? This signs them out of every app.`,
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-secondary p-button-text',
    acceptClass: 'p-button-danger',
    accept: () => revokeSession(session)
  })
}

async function revokeSelected() {
  if (selectedSessions.value.length === 0) return

  // De-duplicate by user — multiple sessions can belong to the same user, and
  // revocation is per-user.
  const userIds = [...new Set(selectedSessions.value.map(s => s.user_id))]
  try {
    await Promise.all(userIds.map(id => api.revokeUserTokens(id)))
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: `Tokens revoked for ${userIds.length} user(s)`,
      life: 3000
    })
    selectedSessions.value = []
    loadSessions()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke user tokens', life: 3000 })
  }
}

function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

function formatRelative(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

function parseUserAgent(ua?: string): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' }
  
  let browser = 'Unknown'
  let os = 'Unknown'
  
  // Browser detection
  if (ua.includes('Chrome') && !ua.includes('Edge')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Edge')) browser = 'Edge'
  else if (ua.includes('Opera')) browser = 'Opera'
  
  // OS detection
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  
  return { browser, os }
}

function isExpiringSoon(expiresAt: string): boolean {
  const expires = new Date(expiresAt)
  const now = new Date()
  const diffHours = (expires.getTime() - now.getTime()) / (1000 * 60 * 60)
  return diffHours < 1 && diffHours > 0
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

onMounted(() => {
  loadSessions()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <ConfirmPopup />
    
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Active Sessions</h1>
        <p class="text-[var(--color-text-muted)]">Sessions inferred from recent activity. Revoking signs the user out of every app.</p>
      </div>
      <div class="flex items-center gap-3">
        <Button 
          v-if="selectedSessions.length > 0"
          :label="`Revoke User Tokens (${selectedSessions.length})`"
          icon="pi pi-ban"
          severity="danger"
          @click="revokeSelected"
        />
        <Button 
          icon="pi pi-refresh" 
          severity="secondary" 
          text 
          rounded
          @click="loadSessions"
          :loading="store.isLoading['sessions']"
        />
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="metric-card" style="--card-accent: var(--color-accent-primary)">
        <div class="flex items-center justify-between">
          <div>
            <div class="metric-value">{{ store.sessionsTotal }}</div>
            <div class="metric-label">Total Sessions</div>
          </div>
          <i class="pi pi-users text-3xl text-[var(--color-accent-primary)] opacity-50"></i>
        </div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-secure)">
        <div class="flex items-center justify-between">
          <div>
            <div class="metric-value text-[var(--color-status-secure)]">
              {{ store.sessions.filter(s => !isExpired(s.expires_at)).length }}
            </div>
            <div class="metric-label">Active</div>
          </div>
          <i class="pi pi-check-circle text-3xl text-[var(--color-status-secure)] opacity-50"></i>
        </div>
      </div>
      <div class="metric-card" style="--card-accent: var(--color-status-warning)">
        <div class="flex items-center justify-between">
          <div>
            <div class="metric-value text-[var(--color-status-warning)]">
              {{ store.sessions.filter(s => isExpiringSoon(s.expires_at)).length }}
            </div>
            <div class="metric-label">Expiring Soon</div>
          </div>
          <i class="pi pi-clock text-3xl text-[var(--color-status-warning)] opacity-50"></i>
        </div>
      </div>
    </div>

    <!-- Sessions Table -->
    <div class="panel">
      <DataTable 
        :value="store.sessions"
        v-model:selection="selectedSessions"
        :loading="store.isLoading['sessions']"
        class="data-table"
        stripedRows
        :rowHover="true"
        dataKey="id"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="user_email" header="User">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-[var(--color-surface-300)] flex items-center justify-center">
                <i class="pi pi-user text-sm"></i>
              </div>
              <div>
                <div class="font-medium">{{ data.user_email }}</div>
                <div class="text-xs text-[var(--color-text-muted)]">ID: {{ data.user_id }}</div>
              </div>
            </div>
          </template>
        </Column>
        <Column field="app_name" header="Application">
          <template #body="{ data }">
            <Tag :value="data.app_name" severity="info" />
          </template>
        </Column>
        <Column field="ip_address" header="IP Address">
          <template #body="{ data }">
            <span class="font-mono text-sm">{{ data.ip_address }}</span>
          </template>
        </Column>
        <Column field="user_agent" header="Device">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <i :class="[
                'pi',
                parseUserAgent(data.user_agent).os === 'Windows' ? 'pi-microsoft' :
                parseUserAgent(data.user_agent).os === 'macOS' ? 'pi-apple' :
                parseUserAgent(data.user_agent).os === 'Linux' ? 'pi-server' :
                'pi-mobile'
              ]"></i>
              <span class="text-sm">{{ parseUserAgent(data.user_agent).browser }}</span>
            </div>
          </template>
        </Column>
        <Column field="last_activity" header="Last Activity">
          <template #body="{ data }">
            <span class="text-sm">{{ formatRelative(data.last_activity) }}</span>
          </template>
        </Column>
        <Column field="expires_at" header="Status">
          <template #body="{ data }">
            <Tag 
              v-if="isExpired(data.expires_at)"
              value="Expired"
              severity="secondary"
            />
            <Tag 
              v-else-if="isExpiringSoon(data.expires_at)"
              value="Expiring"
              severity="warning"
            />
            <Tag 
              v-else
              value="Active"
              severity="success"
            />
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
                @click="showDetails(data)"
                v-tooltip.top="'Details'"
              />
              <Button 
                icon="pi pi-ban" 
                severity="danger" 
                text 
                rounded
                size="small"
                @click="confirmRevoke($event, data)"
                v-tooltip.top="'Revoke user tokens'"
              />
            </div>
          </template>
        </Column>
      </DataTable>
      
      <Paginator 
        :rows="pageSize"
        :totalRecords="store.sessionsTotal"
        :rowsPerPageOptions="[10, 20, 50]"
        @page="onPage"
        class="mt-4"
      />
    </div>

    <!-- Session Details Dialog -->
    <Dialog 
      v-model:visible="showDetailsDialog" 
      header="Session Details" 
      :style="{ width: '550px' }"
      modal
    >
      <div v-if="selectedSession" class="space-y-4">
        <!-- User Info -->
        <div class="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface-100)]">
          <div class="w-12 h-12 rounded-full bg-[var(--color-surface-300)] flex items-center justify-center">
            <i class="pi pi-user text-xl"></i>
          </div>
          <div>
            <div class="font-medium">{{ selectedSession.user_email }}</div>
            <div class="text-sm text-[var(--color-text-muted)]">User ID: {{ selectedSession.user_id }}</div>
          </div>
        </div>

        <!-- Details Grid -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Session ID</div>
            <div class="font-mono text-sm break-all">{{ selectedSession.id }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Application</div>
            <Tag :value="selectedSession.app_name" severity="info" />
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">IP Address</div>
            <div class="font-mono">{{ selectedSession.ip_address }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Device</div>
            <div>{{ parseUserAgent(selectedSession.user_agent).browser }} / {{ parseUserAgent(selectedSession.user_agent).os }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Created</div>
            <div class="text-sm">{{ formatDate(selectedSession.created_at) }}</div>
          </div>
          <div>
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Last Activity</div>
            <div class="text-sm">{{ formatRelative(selectedSession.last_activity) }}</div>
          </div>
          <div class="col-span-2">
            <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">Expires</div>
            <div class="flex items-center gap-2">
              <span class="text-sm">{{ formatDate(selectedSession.expires_at) }}</span>
              <Tag 
                v-if="isExpired(selectedSession.expires_at)"
                value="Expired"
                severity="secondary"
              />
              <Tag 
                v-else-if="isExpiringSoon(selectedSession.expires_at)"
                value="Expiring Soon"
                severity="warning"
              />
            </div>
          </div>
        </div>

        <!-- User Agent -->
        <div v-if="selectedSession.user_agent">
          <div class="text-xs text-[var(--color-text-muted)] uppercase mb-1">User Agent</div>
          <div class="font-mono text-xs bg-[var(--color-surface-100)] p-2 rounded break-all">
            {{ selectedSession.user_agent }}
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Close" severity="secondary" @click="showDetailsDialog = false" />
        <Button
          label="Revoke User Tokens"
          icon="pi pi-ban"
          severity="danger"
          @click="revokeSession(selectedSession!)"
        />
      </template>
    </Dialog>
  </div>
</template>
