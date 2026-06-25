<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

// Local copy of settings — in-memory only, never auto-persisted
const form = ref({
  adminUrl: authStore.config.adminUrl,
  oauthUrl: authStore.config.oauthUrl,
  clientId: authStore.config.clientId,
  clientSecret: authStore.config.clientSecret,
  scopes: [...authStore.config.scopes]
})

const isSaving = ref(false)
const tokenExpiryDisplay = ref('—')
let expiryTimer: ReturnType<typeof setInterval> | null = null

const isHttpWarning = computed(() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (isLocalhost) return false
  return form.value.adminUrl.startsWith('http://') || form.value.oauthUrl.startsWith('http://')
})

const availableScopes = ['openid', 'profile', 'email', 'offline_access']

function toggleScope(scope: string) {
  const idx = form.value.scopes.indexOf(scope)
  if (idx >= 0) form.value.scopes.splice(idx, 1)
  else form.value.scopes.push(scope)
}

function updateExpiryDisplay() {
  const expiresAt = authStore.tokenExpiresAt
  if (!expiresAt) { tokenExpiryDisplay.value = '—'; return }
  const remaining = Math.round((expiresAt - Date.now()) / 1000)
  if (remaining <= 0) { tokenExpiryDisplay.value = 'Expired'; return }
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  tokenExpiryDisplay.value = m > 0 ? `${m}m ${s}s` : `${s}s`
}

onMounted(() => {
  updateExpiryDisplay()
  expiryTimer = setInterval(updateExpiryDisplay, 1000)
})

onUnmounted(() => {
  if (expiryTimer) clearInterval(expiryTimer)
})

async function save() {
  isSaving.value = true
  try {
    authStore.updateConfig({
      adminUrl: form.value.adminUrl,
      oauthUrl: form.value.oauthUrl,
      clientId: form.value.clientId,
      clientSecret: form.value.clientSecret,
      scopes: form.value.scopes
    })
    toast.add({ severity: 'success', summary: 'Settings saved', detail: 'Configuration updated. Client secret is stored in-memory only.', life: 4000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Save failed', detail: 'Could not save settings.', life: 3000 })
  } finally {
    isSaving.value = false
  }
}

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <i class="pi pi-cog text-2xl text-[var(--color-accent-primary)]"></i>
      <div>
        <h1 class="text-2xl font-bold">Settings</h1>
        <p class="text-sm text-[var(--color-text-muted)]">OAuth2 client and server configuration</p>
      </div>
    </div>

    <Message v-if="isHttpWarning" severity="warn" :closable="false">
      HTTP (non-HTTPS) URLs detected in a non-localhost environment. Switch to HTTPS in production.
    </Message>

    <!-- Server Section -->
    <Card>
      <template #title>
        <div class="flex items-center gap-2">
          <i class="pi pi-server text-[var(--color-accent-primary)]"></i>
          Server URLs
        </div>
      </template>
      <template #content>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Admin API URL</label>
            <IconField>
              <InputIcon class="pi pi-server" />
              <InputText v-model="form.adminUrl" class="w-full" placeholder="https://admin.example.com" />
            </IconField>
          </div>
          <div>
            <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">OAuth2 Server URL</label>
            <IconField>
              <InputIcon class="pi pi-lock" />
              <InputText v-model="form.oauthUrl" class="w-full" placeholder="https://auth.example.com" />
            </IconField>
          </div>
        </div>
      </template>
    </Card>

    <!-- OAuth Client Section -->
    <Card>
      <template #title>
        <div class="flex items-center gap-2">
          <i class="pi pi-id-card text-[var(--color-accent-primary)]"></i>
          OAuth2 Client
        </div>
      </template>
      <template #content>
        <div class="space-y-4">
          <Message severity="info" :closable="false" class="text-sm">
            The client secret is kept in-memory only and is never written to browser storage.
          </Message>

          <div>
            <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Client ID <span class="text-[var(--color-status-danger)]">*</span></label>
            <IconField>
              <InputIcon class="pi pi-key" />
              <InputText v-model="form.clientId" class="w-full" placeholder="security-monitor" />
            </IconField>
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Client Secret <Tag value="Optional — in-memory" severity="secondary" class="ml-2 text-xs" />
            </label>
            <IconField>
              <InputIcon class="pi pi-lock" />
              <InputText v-model="form.clientSecret" type="password" class="w-full" placeholder="Leave empty for public PKCE clients" />
            </IconField>
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-3">Scopes</label>
            <div class="flex flex-wrap gap-3">
              <div v-for="scope in availableScopes" :key="scope" class="flex items-center gap-2">
                <Checkbox :modelValue="form.scopes.includes(scope)" @update:modelValue="toggleScope(scope)" :inputId="'scope-' + scope" binary />
                <label :for="'scope-' + scope" class="text-sm cursor-pointer">{{ scope }}</label>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Session Section -->
    <Card>
      <template #title>
        <div class="flex items-center gap-2">
          <i class="pi pi-user text-[var(--color-accent-primary)]"></i>
          Session
        </div>
      </template>
      <template #content>
        <div class="space-y-4">
          <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div>
              <div class="text-sm font-medium">Signed in as</div>
              <div class="text-sm text-[var(--color-text-muted)]">{{ authStore.user?.email || authStore.user?.name || authStore.user?.sub || '—' }}</div>
            </div>
            <Tag v-if="authStore.user?.roles?.length" :value="authStore.user.roles[0]" severity="info" />
          </div>

          <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div>
              <div class="text-sm font-medium">Access token expires in</div>
              <div class="text-sm font-mono text-[var(--color-text-muted)]">{{ tokenExpiryDisplay }}</div>
            </div>
            <i class="pi pi-clock text-[var(--color-text-muted)]"></i>
          </div>

          <Divider />
          <Button label="Sign Out" icon="pi pi-sign-out" severity="danger" outlined @click="logout" />
        </div>
      </template>
    </Card>

    <!-- Save -->
    <div class="flex justify-end gap-3">
      <Button label="Cancel" severity="secondary" outlined @click="router.back()" />
      <Button label="Save Settings" icon="pi pi-check" :loading="isSaving" @click="save" />
    </div>
  </div>
</template>
