<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'
import { useVersionCheck } from '@/composables/useVersionCheck'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import VersionBadge from '@/components/VersionBadge.vue'
import StepUpDialog from '@/components/StepUpDialog.vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const monitorStore = useMonitorStore()

// Stale-tab detection — polls /api/version every 5 min, shows a toast on change
useVersionCheck()

const showSidebar = computed(() =>
  authStore.isAuthenticated &&
  !['setup', 'login', 'callback', 'unauthorised'].includes(route.name as string)
)

const navItems = [
  { name: 'Dashboard', route: 'dashboard', icon: 'pi-th-large' },
  { name: 'Security Events', route: 'events', icon: 'pi-list' },
  { name: 'Threat Intel', route: 'threats', icon: 'pi-shield' },
  { name: 'Geo Analytics', route: 'geo', icon: 'pi-globe' },
  { name: 'Sessions', route: 'sessions', icon: 'pi-users' },
  { name: 'Token Analytics', route: 'tokens', icon: 'pi-key' },
  { name: 'Alerts', route: 'alerts', icon: 'pi-bell', badge: true },
  { name: 'Blocked IPs', route: 'blocked-ips', icon: 'pi-ban' },
  { name: 'Audit Trail', route: 'audit-logs', icon: 'pi-history' },
  { name: 'Reports', route: 'reports', icon: 'pi-file' }
]

async function logout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <aside
      v-if="showSidebar"
      class="w-64 bg-[var(--color-surface-50)] border-r border-[var(--color-border-subtle)] flex flex-col"
    >
      <!-- Logo -->
      <div class="p-4 border-b border-[var(--color-border-subtle)]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-cyan)] flex items-center justify-center">
            <i class="pi pi-shield text-white text-xl"></i>
          </div>
          <div>
            <h1 class="text-lg font-bold gradient-text">Security</h1>
            <p class="text-xs text-[var(--color-text-muted)]">Monitor</p>
          </div>
        </div>
      </div>

      <!-- Live Status -->
      <div class="px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <div class="flex items-center justify-between">
          <span class="live-indicator" v-if="monitorStore.isSSEConnected">Live</span>
          <span class="text-xs text-[var(--color-text-muted)]" v-else>
            <i class="pi pi-circle-off mr-1"></i>Offline
          </span>
          <span
            v-if="monitorStore.unacknowledgedAlerts > 0"
            class="px-2 py-0.5 text-xs font-bold bg-[var(--color-status-danger)] text-white rounded-full"
          >
            {{ monitorStore.unacknowledgedAlerts }}
          </span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.route"
          :to="{ name: item.route }"
          class="nav-item"
          :class="{ active: route.name === item.route }"
        >
          <i :class="['pi', item.icon, 'text-lg']"></i>
          <span class="flex-1">{{ item.name }}</span>
          <span
            v-if="item.badge && monitorStore.unacknowledgedAlerts > 0"
            class="w-5 h-5 flex items-center justify-center text-xs font-bold bg-[var(--color-status-danger)] text-white rounded-full"
          >
            {{ monitorStore.unacknowledgedAlerts > 9 ? '9+' : monitorStore.unacknowledgedAlerts }}
          </span>
        </RouterLink>
      </nav>

      <!-- User, Settings & Logout -->
      <div class="p-3 border-t border-[var(--color-border-subtle)] space-y-2">
        <RouterLink
          :to="{ name: 'settings' }"
          class="nav-item"
          :class="{ active: route.name === 'settings' }"
        >
          <i class="pi pi-cog text-lg"></i>
          <span class="flex-1">Settings</span>
        </RouterLink>

        <div class="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-surface-100)]">
          <div class="w-8 h-8 rounded-full bg-[var(--color-surface-300)] flex items-center justify-center">
            <i class="pi pi-user text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">
              {{ authStore.user?.name || authStore.user?.email || 'Admin' }}
            </div>
            <div class="text-xs text-[var(--color-text-muted)] truncate">
              {{ authStore.user?.email || authStore.user?.sub }}
            </div>
          </div>
          <button
            @click="logout"
            class="quick-action danger"
            v-tooltip.top="'Sign Out'"
          >
            <i class="pi pi-sign-out text-sm"></i>
          </button>
        </div>

        <!-- Version badge -->
        <div class="px-2 pt-1 pb-0.5">
          <VersionBadge />
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-h-screen overflow-hidden">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>

    <!-- Global Components -->
    <Toast position="top-right" />
    <ConfirmDialog />
    <StepUpDialog />
  </div>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  position: relative;
}

.nav-item:hover {
  background: var(--color-surface-200);
  color: var(--color-text-primary);
}

.nav-item.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-accent-primary);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--color-accent-primary);
  border-radius: 0 2px 2px 0;
}
</style>
