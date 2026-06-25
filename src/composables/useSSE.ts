import { ref, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useMonitorStore } from '@/stores/monitorStore'
import { useLogger } from '@/utils/logger'
import type { SecurityEvent } from '@/types'

const log = useLogger('sse')

export function useSSE() {
  const authStore = useAuthStore()
  const monitorStore = useMonitorStore()
  
  const abortController = ref<AbortController | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000
  const isConnecting = ref(false)

  async function connect() {
    if (isConnecting.value) return
    
    disconnect()
    isConnecting.value = true

    const token = authStore.getAccessToken()
    if (!token) {
      log.warn('no access token — aborting connect')
      isConnecting.value = false
      return
    }

    // Use relative URL to go through Vite proxy in development
    // In production, use the configured adminUrl
    const baseUrl = import.meta.env.DEV ? '' : authStore.config.adminUrl
    const url = `${baseUrl}/api/admin/events/stream`
    
    try {
      abortController.value = new AbortController()
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        signal: abortController.value.signal
      })

      if (!response.ok) {
        // Read the body to get the server's error message before throwing
        const errBody = await response.text().catch(() => '(unreadable)')
        log.error(`server replied ${response.status} — body: ${errBody.slice(0, 500)}`)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      log.info('connected to', url)
      monitorStore.setSSEConnected(true)
      reconnectAttempts.value = 0
      isConnecting.value = false

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          log.info('stream ended')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        let currentEvent = ''
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim()
          } else if (line === '' && currentData) {
            // Empty line means end of event
            processEvent(currentEvent, currentData)
            currentEvent = ''
            currentData = ''
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        log.debug('connection aborted (intentional disconnect)')
        return
      }

      log.error('connection error:', error.message)
      monitorStore.setSSEConnected(false)
      isConnecting.value = false

      // Attempt reconnect
      if (reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++
        log.warn(`reconnecting — attempt ${reconnectAttempts.value}/${maxReconnectAttempts}`)
        setTimeout(connect, reconnectDelay * reconnectAttempts.value)
      } else {
        log.error('max reconnect attempts reached — giving up')
      }
    }
  }

  function processEvent(eventType: string, data: string) {
    try {
      const parsed = JSON.parse(data)
      
      switch (eventType) {
        case 'security_event': {
          // CQ-04: build explicitly instead of unsafe cast
          const ev: SecurityEvent = {
            id: parsed.id,
            event_type: parsed.event_type,
            severity: parsed.severity,
            ip_address: parsed.ip_address ?? '',
            success: parsed.success ?? false,
            created_at: parsed.created_at ?? new Date().toISOString(),
            user_id: parsed.user_id,
            user_email: parsed.user_email,
            app_id: parsed.app_id,
            app_name: parsed.app_name,
            user_agent: parsed.user_agent,
            details: parsed.details
          }
          monitorStore.addLiveEvent(ev)
          break
        }
        case 'alert': {
          // CQ-04: build explicitly without unsafe cast — read fields directly from parsed
          const ev: SecurityEvent = {
            id: parsed.id,
            event_type: 'suspicious_activity',
            severity: parsed.severity,
            ip_address: parsed.details?.ip_address ?? '',
            success: false,
            created_at: parsed.triggered_at ?? new Date().toISOString(),
            details: { alert: parsed.message }
          }
          monitorStore.addLiveEvent(ev)
          break
        }
        
        case 'heartbeat':
          log.debug('heartbeat')
          break
        
        default:
          // Try to handle as generic event
          if (parsed.type === 'security_event' && parsed.data) {
            monitorStore.addLiveEvent(parsed.data)
          }
      }
    } catch (e) {
      // Data may not be JSON (e.g., heartbeat timestamp)
      if (eventType === 'heartbeat') {
        log.debug('heartbeat (non-JSON)')
      }
    }
  }

  function disconnect() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
    monitorStore.setSSEConnected(false)
    isConnecting.value = false
  }

  function isConnected(): boolean {
    return monitorStore.isSSEConnected
  }

  // Auto-cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    connect,
    disconnect,
    isConnected,
    reconnectAttempts
  }
}
