<script setup lang="ts">
// Whether the Socrate server evaluates the alert rules is its ALERT_RULES_MODE
// (go-oauth2 #258), reported as evaluation_mode with the rules. Say so where
// rules are managed, so that no operator relies on a rule that does nothing.
import Message from 'primevue/message'
import type { AlertEvaluationMode } from '@/types'

defineProps<{ mode: AlertEvaluationMode }>()
</script>

<template>
  <Message v-if="mode === 'off'" severity="info" :closable="false" class="mb-6" data-testid="alert-rules-mode-off">
    <span>
      <i class="pi pi-info-circle mr-2"></i>
      <strong>Alert rules are not active.</strong>
      Rules are saved, but the server does not evaluate them (<code>ALERT_RULES_MODE</code> is off):
      no alert is raised and no notification is sent, whatever a rule says. Until it does, watch
      the Events and Threats pages.
    </span>
  </Message>
  <Message v-else-if="mode === 'observe'" severity="info" :closable="false" class="mb-6" data-testid="alert-rules-mode-observe">
    <span>
      <i class="pi pi-info-circle mr-2"></i>
      <strong>Alert rules run in observe mode.</strong>
      Triggered alerts are recorded in the history, but no email, webhook or Slack notification is
      sent (<code>ALERT_RULES_MODE</code> is observe). Use it to tune the thresholds.
    </span>
  </Message>
</template>
