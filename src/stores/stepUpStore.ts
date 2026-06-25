import { defineStore } from 'pinia'
import { ref } from 'vue'

// Coordinates the Tier-0 step-up (elevation) dialog. When an admin API call
// returns 403 elevation_required, the API layer calls request() to obtain a
// promise that resolves once the user has successfully re-authenticated (via
// authStore.elevate, driven by StepUpDialog) — then the original call is
// retried. Concurrent requests (e.g. a bulk revoke firing many calls) are
// coalesced onto a single dialog and a single elevation.
export const useStepUpStore = defineStore('stepUp', () => {
  const visible = ref(false)

  let pending: Promise<void> | null = null
  let resolvePending: (() => void) | null = null
  let rejectPending: ((reason?: unknown) => void) | null = null

  // Called by the API layer on elevation_required. Returns a promise that
  // resolves when elevation succeeds and rejects if the user cancels.
  function request(): Promise<void> {
    if (pending) return pending
    visible.value = true
    pending = new Promise<void>((resolve, reject) => {
      resolvePending = resolve
      rejectPending = reject
    })
    return pending
  }

  // Called by StepUpDialog after authStore.elevate() succeeds.
  function complete() {
    visible.value = false
    resolvePending?.()
    reset()
  }

  // Called when the user dismisses the dialog.
  function cancel() {
    visible.value = false
    rejectPending?.(new Error('step-up cancelled'))
    reset()
  }

  function reset() {
    pending = null
    resolvePending = null
    rejectPending = null
  }

  return { visible, request, complete, cancel }
})
