<template>
  <div class="version-badge" :title="tooltip" :aria-label="tooltip">
    <span class="version-item">
      <span class="version-label">FE</span>
      <span class="version-value">{{ withVPrefix(clientVersion) }}</span>
    </span>
    <span class="version-sep">·</span>
    <span class="version-item">
      <span class="version-label">BE</span>
      <span class="version-value">{{ withVPrefix(backendVersion) }}</span>
      <span v-if="backendCommit !== '…'" class="version-commit">{{ backendCommit }}</span>
    </span>
    <span v-if="fetchError" class="version-error" title="Backend version endpoint unreachable">
      <i class="pi pi-exclamation-circle" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVersionInfo, withVPrefix } from '@/composables/useVersionInfo'

const {
  clientVersion, clientBuildDate, clientBuildNode, clientBuildVite,
  backendVersion, backendCommit, backendBranch, backendBuildTime, backendGoVersion,
  backendLoaded, fetchError,
} = useVersionInfo()

const consoleLine =
  `Console ${withVPrefix(clientVersion)} — built ${clientBuildDate} ` +
  `with Node ${clientBuildNode}, Vite ${clientBuildVite}`

// Plain text only: bound to `title`/`aria-label`, which Vue escapes. Parts the
// server did not send (older servers have no go_version) are left out.
const serverLine = computed(() => {
  if (fetchError.value) return 'Server version unavailable'
  if (!backendLoaded.value) return 'Server version loading…'
  let line = `Server ${withVPrefix(backendVersion.value)}`
  const ref = [backendCommit.value, backendBranch.value].filter(v => v && v !== '…').join(', ')
  if (ref) line += ` (${ref})`
  if (backendBuildTime.value || backendGoVersion.value) {
    line += ' — built'
    if (backendBuildTime.value) line += ` ${backendBuildTime.value}`
    if (backendGoVersion.value) line += ` with ${backendGoVersion.value}`
  }
  return line
})

const tooltip = computed(() => `${consoleLine}\n${serverLine.value}`)
</script>

<style scoped>
.version-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.65rem;
  color: var(--color-text-muted, #6b7280);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.version-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
}

.version-commit {
  font-family: monospace;
  opacity: 0.5;
  font-size: 0.6rem;
}

.version-sep {
  opacity: 0.35;
}

.version-error {
  color: var(--color-status-warning, #f59e0b);
  font-size: 0.7rem;
}
</style>
