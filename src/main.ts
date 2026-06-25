import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import Ripple from 'primevue/ripple'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/authStore'
import { useVersionStore } from '@/stores/version'
import './style.css'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark-mode',
      cssLayer: false
    }
  },
  ripple: true
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)
app.directive('ripple', Ripple)

// Fire-and-forget — does not block mount. Populates useVersionStore().backend
// for the VersionBadge and seeds the stale-tab detection snapshot in useVersionCheck().
useVersionStore().fetchBackend()

// Resolve the BFF session (cookie-based) BEFORE installing the router so the
// first navigation guard sees the auth state. Failure resolves to
// "unauthenticated" and the guard routes to /login.
useAuthStore().fetchSession().finally(() => {
  app.use(router)
  app.mount('#app')
})
