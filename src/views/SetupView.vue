<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import StepPanels from 'primevue/steppanels'
import Step from 'primevue/step'
import StepPanel from 'primevue/steppanel'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'

const router = useRouter()
const authStore = useAuthStore()

const config = ref({
  adminUrl: authStore.config.adminUrl || 'http://localhost:8081',
  oauthUrl: authStore.config.oauthUrl || 'http://localhost:8080'
})

const activeStep = ref('1')
const isTestingConnection = ref(false)
const connectionStatus = ref<'idle' | 'success' | 'error'>('idle')
const connectionError = ref('')
const healthData = ref<any>(null)

const isHttpWarning = computed(() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (isLocalhost) return false
  return config.value.adminUrl.startsWith('http://') || config.value.oauthUrl.startsWith('http://')
})

const canProceedStep1 = computed(() => config.value.adminUrl && config.value.oauthUrl)
const canProceedStep2 = computed(() => connectionStatus.value === 'success')

async function testConnection() {
  isTestingConnection.value = true
  connectionStatus.value = 'idle'
  connectionError.value = ''
  healthData.value = null

  try {
    const response = await fetch(`${config.value.adminUrl}/api/admin/dashboard/health`)

    if (response.status === 401 || response.status === 403) {
      const ct = response.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        throw new Error(`HTTP ${response.status}: unexpected response (not JSON — check URL)`)
      }
      healthData.value = { status: 'reachable', note: 'Server requires authentication (expected)', version: 'N/A' }
      connectionStatus.value = 'success'
      return
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

    const data = await response.json()
    healthData.value = data
    connectionStatus.value = 'success'
  } catch (err: any) {
    connectionError.value = err.name === 'TypeError' && err.message.includes('fetch')
      ? 'Cannot reach server. Check URL and ensure server is running.'
      : err.message || 'Failed to connect to Admin API'
    connectionStatus.value = 'error'
  } finally {
    isTestingConnection.value = false
  }
}

function saveConfiguration() {
  authStore.updateConfig({
    adminUrl: config.value.adminUrl,
    oauthUrl: config.value.oauthUrl,
    setupCompleted: true
  })
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-accent-primary)] opacity-5 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-accent-cyan)] opacity-5 rounded-full blur-3xl"></div>
    </div>

    <div class="w-full max-w-2xl relative z-10">
      <div class="text-center mb-10 animate-slide-in">
        <div class="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-cyan)] flex items-center justify-center glow-blue">
          <i class="pi pi-shield text-4xl text-white"></i>
        </div>
        <h1 class="text-4xl font-bold gradient-text mb-3">Security Monitor</h1>
        <p class="text-[var(--color-text-secondary)] text-lg">Connect to your OAuth2 Admin API</p>
      </div>

      <Card class="animate-fade-in">
        <template #content>
          <Stepper v-model:value="activeStep" linear>
            <StepList>
              <Step value="1">Server</Step>
              <Step value="2">Verify</Step>
              <Step value="3">Connect</Step>
            </StepList>

            <StepPanels>
              <!-- Step 1: Server URLs -->
              <StepPanel v-slot="{ activateCallback }" value="1">
                <div class="py-6 space-y-6">
                  <div class="flex items-center gap-3 mb-6">
                    <i class="pi pi-server text-2xl text-[var(--color-accent-primary)]"></i>
                    <div>
                      <h3 class="text-xl font-semibold">Server URLs</h3>
                      <p class="text-sm text-[var(--color-text-muted)]">Enter your OAuth2 server addresses</p>
                    </div>
                  </div>

                  <Message v-if="isHttpWarning" severity="warn" :closable="false">
                    HTTP (non-HTTPS) URLs detected in a non-localhost environment. Use HTTPS in production to protect token transmission.
                  </Message>

                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Admin API URL</label>
                      <IconField>
                        <InputIcon class="pi pi-server" />
                        <InputText v-model="config.adminUrl" placeholder="http://localhost:8081" class="w-full" />
                      </IconField>
                      <small class="text-[var(--color-text-muted)]">Port 8081 — Admin/monitoring endpoints</small>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">OAuth2 Server URL</label>
                      <IconField>
                        <InputIcon class="pi pi-lock" />
                        <InputText v-model="config.oauthUrl" placeholder="http://localhost:8080" class="w-full" />
                      </IconField>
                      <small class="text-[var(--color-text-muted)]">Port 8080 — OAuth2/OIDC endpoints</small>
                    </div>
                  </div>

                  <Divider />
                  <div class="flex justify-end">
                    <Button label="Continue" icon="pi pi-arrow-right" iconPos="right" :disabled="!canProceedStep1" @click="activateCallback('2')" />
                  </div>
                </div>
              </StepPanel>

              <!-- Step 2: Verify Connection -->
              <StepPanel v-slot="{ activateCallback }" value="2">
                <div class="py-6 space-y-6">
                  <div class="flex items-center gap-3 mb-6">
                    <i class="pi pi-wifi text-2xl text-[var(--color-accent-primary)]"></i>
                    <div>
                      <h3 class="text-xl font-semibold">Verify Connection</h3>
                      <p class="text-sm text-[var(--color-text-muted)]">Test connectivity to Admin API</p>
                    </div>
                  </div>

                  <Card class="bg-[var(--color-surface-100)]">
                    <template #content>
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-full flex items-center justify-center"
                            :class="{ 'bg-[var(--color-status-secure)]': connectionStatus === 'success', 'bg-[var(--color-status-danger)]': connectionStatus === 'error', 'bg-[var(--color-surface-300)]': connectionStatus === 'idle' }">
                            <i :class="['pi text-white', connectionStatus === 'success' ? 'pi-check' : connectionStatus === 'error' ? 'pi-times' : 'pi-server']"></i>
                          </div>
                          <div>
                            <div class="font-medium">{{ config.adminUrl }}</div>
                            <div class="text-sm text-[var(--color-text-muted)]">{{ connectionStatus === 'success' ? 'Connected' : connectionStatus === 'error' ? 'Failed' : 'Ready to test' }}</div>
                          </div>
                        </div>
                        <Button :label="isTestingConnection ? 'Testing...' : 'Test'" :icon="isTestingConnection ? 'pi pi-spin pi-spinner' : 'pi pi-bolt'" :disabled="isTestingConnection" @click="testConnection" :severity="connectionStatus === 'success' ? 'success' : 'secondary'" />
                      </div>
                    </template>
                  </Card>

                  <Message v-if="connectionStatus === 'success'" severity="success" :closable="false">
                    <div class="space-y-1">
                      <div class="font-semibold">Connection Verified</div>
                      <div v-if="healthData" class="text-sm">
                        <span>Status: <Tag :value="healthData.status" :severity="healthData.status === 'healthy' ? 'success' : 'info'" /></span>
                        <span v-if="healthData.version !== 'N/A'" class="ml-2">Version: {{ healthData.version }}</span>
                        <div v-if="healthData.note" class="text-[var(--color-text-muted)] mt-1">{{ healthData.note }}</div>
                      </div>
                    </div>
                  </Message>

                  <Message v-if="connectionStatus === 'error'" severity="error" :closable="false">
                    <div class="font-semibold">Connection Failed</div>
                    <div class="text-sm mt-1">{{ connectionError }}</div>
                  </Message>

                  <Divider />
                  <div class="flex justify-between">
                    <Button label="Back" icon="pi pi-arrow-left" severity="secondary" outlined @click="activateCallback('1')" />
                    <Button label="Continue" icon="pi pi-arrow-right" iconPos="right" :disabled="!canProceedStep2" @click="activateCallback('3')" />
                  </div>
                </div>
              </StepPanel>

              <!-- Step 3: Confirm -->
              <StepPanel v-slot="{ activateCallback }" value="3">
                <div class="py-6 space-y-6">
                  <div class="flex items-center gap-3 mb-6">
                    <i class="pi pi-check-square text-2xl text-[var(--color-accent-primary)]"></i>
                    <div>
                      <h3 class="text-xl font-semibold">Ready to Connect</h3>
                      <p class="text-sm text-[var(--color-text-muted)]">OAuth2 client credentials can be configured after sign-in</p>
                    </div>
                  </div>

                  <Card class="bg-[var(--color-surface-100)]">
                    <template #content>
                      <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div class="text-[var(--color-text-muted)] text-xs uppercase tracking-wide mb-1">Admin URL</div>
                          <div class="font-mono truncate">{{ config.adminUrl }}</div>
                        </div>
                        <div>
                          <div class="text-[var(--color-text-muted)] text-xs uppercase tracking-wide mb-1">OAuth URL</div>
                          <div class="font-mono truncate">{{ config.oauthUrl }}</div>
                        </div>
                      </div>
                    </template>
                  </Card>

                  <Message severity="info" :closable="false">
                    OAuth2 client credentials (Client ID, Secret, Scopes) are loaded from environment variables and can be adjusted in <strong>Settings</strong> after sign-in.
                  </Message>

                  <Divider />
                  <div class="flex justify-between">
                    <Button label="Back" icon="pi pi-arrow-left" severity="secondary" outlined @click="activateCallback('2')" />
                    <Button label="Save & Sign In" icon="pi pi-check" @click="saveConfiguration" />
                  </div>
                </div>
              </StepPanel>
            </StepPanels>
          </Stepper>
        </template>
      </Card>
    </div>
  </div>
</template>
