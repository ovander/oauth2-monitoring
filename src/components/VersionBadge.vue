<template>
  <div class="version-badge">
    <span class="version-item">
      <span class="version-label">FE</span>
      <span class="version-value">v{{ clientVersion }}</span>
    </span>
    <span class="version-sep">·</span>
    <span class="version-item">
      <span class="version-label">BE</span>
      <span class="version-value">v{{ backendVersion }}</span>
      <span v-if="backendCommit !== '…'" class="version-commit">{{ backendCommit }}</span>
    </span>
    <span v-if="fetchError" class="version-error" title="Backend version endpoint unreachable">
      <i class="pi pi-exclamation-circle" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { useVersionInfo } from '@/composables/useVersionInfo'

const { clientVersion, backendVersion, backendCommit, fetchError } = useVersionInfo()
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
