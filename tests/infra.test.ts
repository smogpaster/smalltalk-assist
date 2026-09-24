import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk'
import { describe, expect, it, vi } from 'vitest'
import { BridgeQueue, BridgeTimeoutError } from '../src/bridge/queue'
import { GlassesRenderer, type RenderBridge } from '../src/display/renderer'
import { createTranslator, resolveLanguage } from '../src/i18n'
import { en } from '../src/i18n/locales/en'
import { de } from '../src/i18n/locales/de'
import { ja } from '../src/i18n/locales/ja'
import { sanitizeForGlasses } from '../src/display/text'
import { MemoryKeyValueStore } from '../src/settings/kv'
import { DEFAULT_SETTINGS, migrateSettings } from '../src/settings/schema'
import { SettingsStore } from '../src/settings/store'

describe('BridgeQueue', () => {
  it('runs tasks strictly one after another', async () => {
    const queue = new BridgeQueue()
    const log: string[] = []
    const task = (name: string, ms: number) => () =>
      new Promise<void>(resolve => {
        log.push(`start ${name}`)
        setTimeout(() => {
          log.push(`end ${name}`)
          resolve()
        }, ms)
      })
    await Promise.all([queue.run(task('a', 20)), queue.run(task('b', 1))])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('times out a hanging call and keeps working', async () => {
    const queue = new BridgeQueue(20)
    await expect(queue.run(() => new Promise(() => {}))).rejects.toBeInstanceOf(BridgeTimeoutError)
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok')
  })
})

describe('GlassesRenderer', () => {
  function fakeBridge(createResult = StartUpPageCreateResult.success) {
    const calls: string[] = []
    const bridge: RenderBridge = {
      createStartUpPageContainer: vi.fn(async () => {
        calls.push('create')
        return createResult
      }),
      rebuildPageContainer: vi.fn(async () => {
        calls.push('rebuild')
        return true
      }),
      textContainerUpgrade: vi.fn(async (c: { containerName?: string; content?: string }) => {
        calls.push(`upgrade ${c.containerName}=${c.content}`)
        return true
      }),
    }
    return { bridge, calls }
  }

  it('creates the page once and only sends changed containers', async () => {
    const { bridge, calls } = fakeBridge()
    const r = new GlassesRenderer(bridge, new BridgeQueue())
    await r.init({ header: 'H', body: 'B', menu: [] })
    await r.render({ header: 'H', body: 'B2', menu: [] })
    await r.render({ header: 'H', body: 'B2', menu: [] })
    expect(calls).toEqual(['create', 'upgrade body=B2'])
  })

  it('coalesces bursts to the latest view', async () => {
    const { bridge, calls } = fakeBridge()
    const r = new GlassesRenderer(bridge, new BridgeQueue())
    await r.init({ header: 'H', body: '0', menu: [] })
    const renders = [1, 2, 3, 4].map(i => r.render({ header: 'H', body: String(i), menu: [] }))
    await Promise.all(renders)
    expect(calls).toEqual(['create', 'upgrade body=1', 'upgrade body=4'])
  })

  it('rebuilds the page when the menu changes, then continues with text updates', async () => {
    const { bridge, calls } = fakeBridge()
    const r = new GlassesRenderer(bridge, new BridgeQueue())
    const menu = [{ id: 1, label: 'Start / Stopp' }]
    await r.init({ header: 'H', body: 'B', menu })
    await r.render({ header: 'H', body: 'B', menu: [{ id: 1, label: 'Start / Stop' }] })
    await r.render({ header: 'H', body: 'C', menu: [{ id: 1, label: 'Start / Stop' }] })
    expect(calls).toEqual(['create', 'rebuild', 'upgrade body=C'])
  })

  it('falls back to rebuild when startup creation fails, and never retries creation', async () => {
    const { bridge, calls } = fakeBridge(StartUpPageCreateResult.invalid)
    const r = new GlassesRenderer(bridge, new BridgeQueue())
    await r.init({ header: 'H', body: 'B', menu: [] })
    await r.init({ header: 'H', body: 'B', menu: [] })
    expect(calls).toEqual(['create', 'rebuild', 'rebuild'])
  })
})

describe('settings', () => {
  it('repairs corrupted or partial data', () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings({ mode: 'hacked', suggestionsPerPage: 7, demoLanguage: 'ja' })).toEqual({
      ...DEFAULT_SETTINGS,
      demoLanguage: 'ja',
    })
  })

  it('persists debounced and loads back', async () => {
    vi.useFakeTimers()
    const kv = new MemoryKeyValueStore()
    const store = new SettingsStore(kv, 100)
    store.update({ mode: 'live' })
    store.update({ suggestionsPerPage: 3 })
    expect(kv.data.size).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(JSON.parse(kv.data.get('settings')!)).toMatchObject({ mode: 'live', suggestionsPerPage: 3 })
    vi.useRealTimers()

    const reloaded = new SettingsStore(kv)
    expect(await reloaded.load()).toMatchObject({ mode: 'live', suggestionsPerPage: 3 })
  })
})

describe('i18n', () => {
  it('resolves languages and interpolates', () => {
    expect(resolveLanguage(['ja-JP', 'en'])).toBe('ja')
    expect(resolveLanguage(['fr-FR'])).toBe('en')
    expect(createTranslator('de')('glasses.error', { message: 'x' })).toBe('! x')
  })

  it('has every key in every locale and only renderable glyphs on the glasses', () => {
    for (const catalog of [de, ja]) expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort())
    for (const catalog of [en, de, ja]) {
      for (const [key, value] of Object.entries(catalog)) {
        if (key.startsWith('glasses.') || key.startsWith('menu.')) expect(sanitizeForGlasses(value), key).toBe(value.trim())
        if (key.startsWith('menu.')) expect(new TextEncoder().encode(value).length, key).toBeLessThanOrEqual(32)
      }
    }
  })
})
