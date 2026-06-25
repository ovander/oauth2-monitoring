<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'

const router = useRouter()
const authStore = useAuthStore()

// Server connection (URLs, OAuth client, scopes) is owned by the BFF now — the
// SPA holds no configuration or tokens. This page just reflects the session.
async function logout() {
  await authStore.logout()
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
        <p class="text-sm text-[var(--color-text-muted)]">Your session</p>
      </div>
    </div>

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
              <div class="text-sm text-[var(--color-text-muted)]">
                {{ authStore.user?.email || authStore.user?.name || authStore.user?.sub || '—' }}
              </div>
            </div>
            <Tag v-if="authStore.user?.roles?.length" :value="authStore.user.roles[0]" severity="info" />
          </div>

          <div class="p-3 rounded-lg bg-[var(--color-surface-100)]">
            <div class="text-sm font-medium mb-1">Roles</div>
            <div class="flex flex-wrap gap-2">
              <Tag v-for="role in (authStore.user?.roles ?? [])" :key="role" :value="role" severity="secondary" />
              <span v-if="!authStore.user?.roles?.length" class="text-sm text-[var(--color-text-muted)]">—</span>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-[var(--color-surface-100)] text-sm text-[var(--color-text-muted)]">
            <i class="pi pi-shield mr-2 text-[var(--color-accent-primary)]"></i>
            Your session is held server-side by the BFF. No access or refresh tokens
            are stored in this browser.
          </div>

          <Divider />
          <Button label="Sign Out" icon="pi pi-sign-out" severity="danger" outlined @click="logout" />
        </div>
      </template>
    </Card>
  </div>
</template>
