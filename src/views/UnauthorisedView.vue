<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Button from 'primevue/button'

const router = useRouter()
const authStore = useAuthStore()

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="text-center space-y-6 max-w-md">
      <div class="w-20 h-20 mx-auto rounded-full bg-[var(--color-status-danger)] flex items-center justify-center">
        <i class="pi pi-ban text-4xl text-white"></i>
      </div>
      <div>
        <h1 class="text-2xl font-bold mb-2">Access Denied</h1>
        <p class="text-[var(--color-text-muted)]">
          Your account does not have the required admin role to access this dashboard.
          Contact your administrator to request access.
        </p>
      </div>
      <div class="flex gap-3 justify-center">
        <Button label="Sign Out" icon="pi pi-sign-out" severity="danger" outlined @click="logout" />
      </div>
    </div>
  </div>
</template>
