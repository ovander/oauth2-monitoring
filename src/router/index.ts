import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useLogger } from '@/utils/logger'

const log = useLogger('router')

// Route meta type augmentation
declare module 'vue-router' {
  interface RouteMeta {
    guest?: boolean          // unauthenticated access allowed
    requiresSetup?: boolean  // setup wizard must be completed
    requiresAuth?: boolean   // any authenticated user with viewer or admin role
    requiresAdmin?: boolean  // full write access required (implies requiresAuth)
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ── Public / unauthenticated ───────────────────────────────────────────────
    { path: '/setup',       name: 'setup',       component: () => import('@/views/SetupView.vue'),       meta: { guest: true } },
    { path: '/login',       name: 'login',       component: () => import('@/views/LoginView.vue'),       meta: { guest: true, requiresSetup: true } },
    { path: '/callback',    name: 'callback',    component: () => import('@/views/CallbackView.vue'),    meta: { guest: true } },
    // NOTE: no guest:true — authenticated users with wrong roles land here,
    // so marking it guest would cause an infinite redirect loop.
    { path: '/unauthorised', name: 'unauthorised', component: () => import('@/views/UnauthorisedView.vue') },

    // ── Viewer routes (read-only — monitor_viewer, monitor_admin, admin) ───────
    { path: '/',          name: 'dashboard',  component: () => import('@/views/DashboardView.vue'),  meta: { requiresAuth: true } },
    { path: '/events',    name: 'events',     component: () => import('@/views/EventsView.vue'),     meta: { requiresAuth: true } },
    { path: '/threats',   name: 'threats',    component: () => import('@/views/ThreatsView.vue'),    meta: { requiresAuth: true } },
    { path: '/sessions',  name: 'sessions',   component: () => import('@/views/SessionsView.vue'),   meta: { requiresAuth: true } },
    { path: '/tokens',    name: 'tokens',     component: () => import('@/views/TokensView.vue'),     meta: { requiresAuth: true } },
    { path: '/reports',   name: 'reports',    component: () => import('@/views/ReportsView.vue'),    meta: { requiresAuth: true } },
    { path: '/geo',       name: 'geo',        component: () => import('@/views/GeoView.vue'),        meta: { requiresAuth: true } },

    // ── Admin routes (write access — monitor_admin, admin only) ───────────────
    { path: '/alerts',      name: 'alerts',      component: () => import('@/views/AlertsView.vue'),      meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/blocked-ips', name: 'blocked-ips', component: () => import('@/views/BlockedIPsView.vue'),  meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/audit-logs',  name: 'audit-logs',  component: () => import('@/views/AuditLogsView.vue'),   meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/settings',    name: 'settings',    component: () => import('@/views/SettingsView.vue'),    meta: { requiresAuth: true, requiresAdmin: true } },
  ]
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  log.debug(`navigating to "${String(to.name)}" | auth=${authStore.isAuthenticated} | roles=${JSON.stringify(authStore.user?.roles ?? [])}`)

  // Setup required for login page
  if (to.meta.requiresSetup && !authStore.isSetupCompleted) {
    log.debug('setup not completed — redirecting to /setup')
    return next('/setup')
  }

  // Authentication + role checks
  if (to.meta.requiresAuth) {
    if (!authStore.isAuthenticated) {
      log.debug('not authenticated — redirecting to /login')
      return next('/login')
    }

    const userRoles = authStore.user?.roles ?? []

    // requiresAdmin routes need full write access (block IPs, manage rules, etc.)
    // All other requiresAuth routes only need viewer access (read-only dashboards).
    if (to.meta.requiresAdmin) {
      log.debug(`admin check — userRoles=${JSON.stringify(userRoles)} pass=${authStore.isAdmin}`)
      if (!authStore.isAdmin) {
        log.warn('admin access required — redirecting to /unauthorised')
        return next('/unauthorised')
      }
    } else {
      log.debug(`viewer check — userRoles=${JSON.stringify(userRoles)} pass=${authStore.isViewer}`)
      if (!authStore.isViewer) {
        log.warn('access denied (no viewer or admin role) — redirecting to /unauthorised')
        return next('/unauthorised')
      }
    }
  }

  // Redirect authenticated users away from login/setup/callback (guest-only pages)
  // NOTE: /unauthorised is intentionally excluded — authenticated users with wrong
  // roles should be allowed to stay there, not be bounced back to / endlessly.
  const guestOnlyNames = ['login', 'setup', 'callback']
  if (to.meta.guest && authStore.isAuthenticated && !guestOnlyNames.includes(String(to.name))) {
    log.debug('authenticated user on guest page — redirecting to /')
    return next('/')
  }

  // Redirect to login if setup done but on setup page
  if (to.name === 'setup' && authStore.isSetupCompleted) {
    return next('/login')
  }

  next()
})

export default router
