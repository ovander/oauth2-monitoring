<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useLogger } from '@/utils/logger'
import Button from 'primevue/button'

const log = useLogger('login')

const router = useRouter()
const authStore = useAuthStore()
const isLoading = ref(false)

async function login() {
  isLoading.value = true
  try {
    const url = await authStore.getAuthorizationUrlAsync()
    log.debug('redirecting to authorization URL:', url.split('?')[0])
    window.location.href = url
  } catch (error) {
    log.error('failed to build authorization URL:', error)
    isLoading.value = false
  }
}

function reconfigure() {
  authStore.resetConfig()
  router.push('/setup')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <!-- Background effects -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/3 left-1/3 w-96 h-96 bg-[var(--color-accent-primary)] opacity-5 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/3 right-1/3 w-96 h-96 bg-[var(--color-accent-cyan)] opacity-5 rounded-full blur-3xl"></div>
    </div>

    <div class="w-full max-w-md relative z-10 text-center">
      <!-- Logo -->
      <div class="mb-8 animate-slide-in">
        <div class="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-cyan)] flex items-center justify-center glow-blue">
          <i class="pi pi-shield text-5xl text-white"></i>
        </div>
        <h1 class="text-3xl font-bold gradient-text mb-2">Security Monitor</h1>
        <p class="text-[var(--color-text-secondary)]">OAuth2 Security Operations Center</p>
      </div>

      <!-- Login Card -->
      <div class="panel animate-fade-in">
        <div class="space-y-6">
          <div class="text-left">
            <h2 class="text-xl font-semibold mb-2">Sign In</h2>
            <p class="text-sm text-[var(--color-text-muted)]">
              Authenticate with your OAuth2 server to access the security dashboard.
            </p>
          </div>

          <div class="p-4 rounded-lg bg-[var(--color-surface-100)] border border-[var(--color-border-subtle)]">
            <div class="flex items-center gap-3 text-sm">
              <i class="pi pi-server text-[var(--color-accent-primary)]"></i>
              <div class="text-left">
                <div class="font-medium">{{ authStore.config.oauthUrl }}</div>
                <div class="text-xs text-[var(--color-text-muted)]">OAuth2 Server</div>
              </div>
            </div>
          </div>

          <Button 
            label="Sign In with OAuth2" 
            icon="pi pi-sign-in"
            class="w-full"
            :loading="isLoading"
            @click="login"
          />
        </div>
      </div>

      <!-- Reconfigure link -->
      <div class="mt-6 animate-fade-in" style="animation-delay: 0.2s">
        <button 
          @click="reconfigure"
          class="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors"
        >
          <i class="pi pi-cog mr-1"></i>
          Reconfigure Server Connection
        </button>
      </div>
    </div>
  </div>
</template>
