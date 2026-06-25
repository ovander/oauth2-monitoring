<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import Button from 'primevue/button'

const error = ref<Error | null>(null)
const info = ref<string>('')

onErrorCaptured((err, _instance, errorInfo) => {
  error.value = err
  info.value = errorInfo
  return false // prevent propagation
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="min-h-screen flex items-center justify-center p-6">
    <div class="text-center space-y-6 max-w-lg">
      <div class="w-20 h-20 mx-auto rounded-full bg-[var(--color-status-danger)] flex items-center justify-center">
        <i class="pi pi-exclamation-triangle text-4xl text-white"></i>
      </div>
      <div>
        <h1 class="text-2xl font-bold mb-2">Something went wrong</h1>
        <p class="text-[var(--color-text-muted)] mb-4">An unexpected error occurred in the application.</p>
        <details class="text-left text-xs bg-[var(--color-surface-100)] p-3 rounded-lg">
          <summary class="cursor-pointer font-medium mb-2">Error details</summary>
          <pre class="whitespace-pre-wrap break-all">{{ error?.message }}\n{{ info }}</pre>
        </details>
      </div>
      <Button label="Reload Application" icon="pi pi-refresh" @click="reload" />
    </div>
  </div>
</template>
