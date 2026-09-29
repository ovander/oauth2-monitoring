import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useVersionStore } from '@/stores/version'
import { useVersionInfo, withVPrefix } from '@/composables/useVersionInfo'
import VersionBadge from '@/components/VersionBadge.vue'

// A Socrate server after v1.4.0: GET /api/version also carries go_version
// (runtime.Version()).
const SERVER_BODY = {
  version:    'v1.4.2',
  commit:     'a1b2c3d',
  branch:     'main',
  build_time: '2026-09-28T14:03:11Z',
  go_version: 'go1.27.1',
}

// A server up to v1.4.0: no go_version.
const OLD_SERVER_BODY = {
  version:    'v1.4.0',
  commit:     '9f8e7d6',
  branch:     'main',
  build_time: '2026-08-01T09:00:00Z',
}

function stubVersionEndpoint(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ))
}

async function mountWith(body: unknown, status = 200) {
  stubVersionEndpoint(body, status)
  await useVersionStore().fetchBackend()
  return mount(VersionBadge)
}

const CONSOLE_LINE =
  `Console ${withVPrefix(__APP_VERSION__)} — built ${__APP_BUILD_DATE__} ` +
  `with Node ${__APP_BUILD_NODE__}, Vite ${__APP_BUILD_VITE__}`

describe('VersionBadge build info', () => {
  it('build-time toolchain constants are injected', () => {
    expect(__APP_BUILD_NODE__).toMatch(/^v\d+\.\d+\.\d+/)
    expect(__APP_BUILD_VITE__).toMatch(/^\d+\.\d+\.\d+/)
    expect(useVersionInfo().clientToolchain)
      .toBe(`Node ${__APP_BUILD_NODE__} · Vite ${__APP_BUILD_VITE__}`)
  })

  it('tooltip shows the console toolchain and the server go_version', async () => {
    const wrapper = await mountWith(SERVER_BODY)
    const root = wrapper.find('.version-badge')
    const title = root.attributes('title')!

    expect(title).toBe(
      `${CONSOLE_LINE}\n` +
      'Server v1.4.2 (a1b2c3d, main) — built 2026-09-28T14:03:11Z with go1.27.1',
    )
    expect(title).toContain(`Node ${__APP_BUILD_NODE__}`)
    expect(title).toContain(`Vite ${__APP_BUILD_VITE__}`)
    expect(title).toContain('go1.27.1')
    expect(root.attributes('aria-label')).toBe(title)
    expect(useVersionInfo().backendGoVersion.value).toBe('go1.27.1')
  })

  it('omits go_version for an older server without printing "undefined"', async () => {
    const wrapper = await mountWith(OLD_SERVER_BODY)
    const title = wrapper.find('.version-badge').attributes('title')!

    expect(title.split('\n')[1])
      .toBe('Server v1.4.0 (9f8e7d6, main) — built 2026-08-01T09:00:00Z')
    expect(title).not.toContain('undefined')
    expect(wrapper.html()).not.toContain('undefined')
    expect(useVersionInfo().backendGoVersion.value).toBe('')
  })

  it('says the server version is unavailable when the fetch fails', async () => {
    const wrapper = await mountWith({ error: 'unavailable' }, 503)
    const title = wrapper.find('.version-badge').attributes('title')!

    expect(title).toBe(`${CONSOLE_LINE}\nServer version unavailable`)
    expect(title).not.toContain('undefined')
  })

  it('does not double the "v" prefix of a server version', async () => {
    const wrapper = await mountWith(SERVER_BODY)

    expect(wrapper.text()).toContain('v1.4.2')
    expect(wrapper.text()).not.toContain('vv')
    expect(wrapper.find('.version-badge').attributes('title')).not.toContain('vv')
  })

  it('withVPrefix adds "v" only when missing', () => {
    expect(withVPrefix('v1.4.0')).toBe('v1.4.0')
    expect(withVPrefix('1.4.0')).toBe('v1.4.0')
    expect(withVPrefix('1.0.0-rc.1')).toBe('v1.0.0-rc.1')
    expect(withVPrefix('…')).toBe('v…')
  })
})
