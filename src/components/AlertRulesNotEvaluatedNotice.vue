<script setup lang="ts">
// The Socrate server stores alert rules but does not evaluate them yet
// (go-oauth2 #258): no rule raises an alert or sends a notification. Say so
// where rules are managed, so that no operator relies on them.
import Message from 'primevue/message'
</script>

<template>
  <Message severity="info" :closable="false" class="mb-6" data-testid="alert-rules-not-evaluated">
    <span>
      <i class="pi pi-info-circle mr-2"></i>
      <strong>Alert rules are not active yet.</strong>
      Rules are saved, but the server does not evaluate them: no alert is raised and no
      notification is sent, whatever a rule says. Until it does, watch the Events and Threats
      pages.
    </span>
  </Message>
</template>
