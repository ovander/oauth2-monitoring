<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useLogger } from '@/utils/logger'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import Button from 'primevue/button'

const log = useLogger('callback')

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const error = ref<string | null>(null)
const isProcessing = ref(true)

onMounted(async () => {
  log.debug('onMounted — query:', JSON.stringify(route.query))

  const code = route.query.code as string
  const errorParam = route.query.error as string
  const errorDescription = route.query.error_description as string
  const state = route.query.state as string

  if (errorParam) {
    log.debug('server returned error:', errorParam, errorDescription)
    error.value = errorDescription || errorParam
    isProcessing.value = false
    return
  }

  if (!code) {
    log.debug('no code in URL')
    error.value = 'No authorization code received'
    isProcessing.value = false
    return
  }

  // SEC-01: Validate state parameter to prevent CSRF
  const storedState = sessionStorage.getItem('oauth_state')
  const verifier   = sessionStorage.getItem('pkce_verifier')
  log.debug('state check — url:', state?.slice(0, 8), 'stored:', storedState?.slice(0, 8), 'verifier present:', !!verifier)
  sessionStorage.removeItem('oauth_state') // always clear regardless of outcome

  if (!state || !storedState || state !== storedState) {
    log.debug('state mismatch — aborting')
    error.value = 'Invalid state parameter — possible CSRF attack. Please sign in again.'
    isProcessing.value = false
    return
  }

  log.debug('state OK — calling exchangeCode')
  try {
    await authStore.exchangeCode(code)
    log.debug('exchangeCode succeeded — redirecting to /')
    router.push('/')
  } catch (e) {
    log.debug('exchangeCode threw:', e)
    error.value = e instanceof Error ? e.message : 'Authentication failed'
  } finally {
    isProcessing.value = false
  }
})

function retry() {
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="text-center">
      <!-- Processing -->
      <div v-if="isProcessing" class="space-y-4">
        <ProgressSpinner
          style="width: 60px; height: 60px"
          strokeWidth="4"
          animationDuration=".8s"
        />
        <div>
          <h2 class="text-xl font-semibold mb-2">Authenticating...</h2>
          <p class="text-[var(--color-text-muted)]">Please wait while we complete your sign in.</p>
        </div>
      </div>

      <!-- Error -->
      <div v-else class="space-y-6 max-w-md">
        <div class="w-16 h-16 mx-auto rounded-full bg-[var(--color-status-danger)] flex items-center justify-center">
          <i class="pi pi-times text-3xl text-white"></i>
        </div>

        <div>
          <h2 class="text-xl font-semibold mb-2">Authentication Failed</h2>
          <Message severity="error" :closable="false" class="text-left">
            {{ error }}
          </Message>
        </div>

        <Button
          label="Try Again"
          icon="pi pi-refresh"
          @click="retry"
        />
      </div>
    </div>
  </div>
</template>
