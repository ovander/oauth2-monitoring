<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useStepUpStore } from '@/stores/stepUpStore'

import Dialog from 'primevue/dialog'
import Password from 'primevue/password'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'

const authStore = useAuthStore()
const stepUp = useStepUpStore()

const password = ref('')
const mfaCode = ref('')
const mfaRequired = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)

// Reset the form whenever the dialog opens.
watch(() => stepUp.visible, (open) => {
  if (open) {
    password.value = ''
    mfaCode.value = ''
    mfaRequired.value = false
    error.value = null
    loading.value = false
  }
})

async function confirm() {
  if (!password.value) {
    error.value = 'Password is required.'
    return
  }
  loading.value = true
  error.value = null
  try {
    await authStore.elevate(password.value, mfaRequired.value ? mfaCode.value : undefined)
    stepUp.complete()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Step-up failed'
    if (msg === 'mfa_required') {
      mfaRequired.value = true
      error.value = 'Enter your MFA code to continue.'
    } else if (msg === 'invalid mfa code') {
      error.value = 'Invalid MFA code.'
    } else if (msg === 'invalid credentials') {
      error.value = 'Invalid password.'
    } else {
      error.value = msg
    }
  } finally {
    loading.value = false
  }
}

function cancel() {
  stepUp.cancel()
}
</script>

<template>
  <Dialog
    :visible="stepUp.visible"
    modal
    :closable="false"
    header="Confirm your identity"
    :style="{ width: '420px' }"
  >
    <div class="space-y-4">
      <div class="flex items-start gap-3">
        <i class="pi pi-shield text-2xl text-[var(--color-accent-primary)] mt-0.5"></i>
        <p class="text-sm text-[var(--color-text-secondary)]">
          This is a privileged action. Re-enter your credentials to obtain a short-lived
          elevated session (step-up authentication).
        </p>
      </div>

      <Message v-if="error" severity="warn" :closable="false">{{ error }}</Message>

      <div>
        <label class="block text-sm font-medium mb-1">Password</label>
        <Password
          v-model="password"
          :feedback="false"
          toggleMask
          fluid
          inputClass="w-full"
          @keyup.enter="confirm"
        />
      </div>

      <div v-if="mfaRequired">
        <label class="block text-sm font-medium mb-1">MFA Code</label>
        <InputText
          v-model="mfaCode"
          class="w-full"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="123456"
          @keyup.enter="confirm"
        />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text :disabled="loading" @click="cancel" />
      <Button label="Confirm" icon="pi pi-check" :loading="loading" @click="confirm" />
    </template>
  </Dialog>
</template>
