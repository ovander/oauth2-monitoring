<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import Button from 'primevue/button'

const authStore = useAuthStore()
const isLoading = ref(false)

// Hand off to the BFF — the OAuth Authorization Code + PKCE flow runs entirely
// server-side and returns the browser here with an HttpOnly session cookie.
function login() {
  isLoading.value = true
  authStore.login('/')
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
              Authenticate with Socrate to access the security dashboard. Your session
              is held server-side — no tokens are stored in this browser.
            </p>
          </div>

          <Button
            label="Sign In with Socrate"
            icon="pi pi-sign-in"
            class="w-full"
            :loading="isLoading"
            @click="login"
          />
        </div>
      </div>
    </div>
  </div>
</template>
