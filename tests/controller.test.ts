import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlassesController } from '../src/app/glassesController'
import { MenuId } from '../src/app/menu'
import { ConversationSession } from '../src/app/session'
import { createProvidersFactory } from '../src/app/providers'
import { EventHub } from '../src/bridge/hub'
import { BridgeQueue } from '../src/bridge/queue'
import { GlassesRenderer, type RenderBridge } from '../src/display/renderer'
import { createTranslator } from '../src/i18n'
import { DEFAULT_SETTINGS } from '../src/settings/schema'

const createProviders = createProvidersFactory({ get: () => null })

describe('GlassesController gestures', () => {
  let hub: EventHub
  let session: ConversationSession
  let shutDown: ReturnType<typeof vi.fn<(mode?: number) => Promise<boolean>>>
  let rebuilds: number

  beforeEach(async () => {
    vi.useFakeTimers()
    rebuilds = 0
    const bridge: RenderBridge = {
      createStartUpPageContainer: async () => StartUpPageCreateResult.success,
      rebuildPageContainer: async () => {
        rebuilds++
        return true
      },
      textContainerUpgrade: async () => true,
    }
    shutDown = vi.fn(async (_mode?: number) => true)
    const queue = new BridgeQueue()
    hub = new EventHub()
    session = new ConversationSession({ audio: null, settings: () => DEFAULT_SETTINGS, createProviders })
    const renderer = new GlassesRenderer(bridge, queue)
    const controller = new GlassesController({
      bridge: { shutDownPageContainer: shutDown },
      queue,
      hub,
      renderer,
      session,
      translate: () => createTranslator('de'),
      onExit: async () => {},
    })
    await renderer.init(controller.view())
    controller.start()
  })
  afterEach(async () => {
    await session.stop()
    vi.useRealTimers()
  })

  it('starts the session only after the tap grace period', async () => {
    hub.emit({ type: 'tap', source: 'ring' })
    await vi.advanceTimersByTimeAsync(300)
    expect(session.isActive).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(session.isActive).toBe(true)
  })

  it('treats tap + long press as the menu gesture (no start, no quiet)', async () => {
    hub.emit({ type: 'tap', source: 'glasses-right' })
    await vi.advanceTimersByTimeAsync(200)
    hub.emit({ type: 'longPress', source: 'glasses-right' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(session.isActive).toBe(false)
    expect(session.snapshot().phase).toBe('idle')
  })

  it('long press alone toggles quiet mode', async () => {
    hub.emit({ type: 'tap', source: 'ring' })
    await vi.advanceTimersByTimeAsync(500)
    hub.emit({ type: 'longPress', source: 'ring' })
    await vi.advanceTimersByTimeAsync(10)
    expect(session.snapshot().phase).toBe('quiet')
  })

  it('handles menu items', async () => {
    hub.emit({ type: 'menu', itemId: MenuId.toggleSession })
    await vi.advanceTimersByTimeAsync(10)
    expect(session.isActive).toBe(true)
    hub.emit({ type: 'menu', itemId: MenuId.quiet })
    await vi.advanceTimersByTimeAsync(10)
    expect(session.snapshot().phase).toBe('quiet')
  })

  it('opens the exit dialog on double tap and redraws after the user cancels', async () => {
    hub.emit({ type: 'doubleTap', source: 'glasses-right' })
    await vi.advanceTimersByTimeAsync(10)
    expect(shutDown).toHaveBeenCalledWith(1)
    hub.emit({ type: 'foregroundEnter' })
    hub.emit({ type: 'foregroundExit' })
    await vi.advanceTimersByTimeAsync(10)
    expect(rebuilds).toBe(2)
  })
  it('does not redraw for the menu overlay but does after a background trip', async () => {
    hub.emit({ type: 'foregroundEnter' })
    hub.emit({ type: 'menu', itemId: MenuId.quiet })
    hub.emit({ type: 'foregroundExit' })
    await vi.advanceTimersByTimeAsync(10)
    expect(rebuilds).toBe(0)

    hub.emit({ type: 'foregroundExit' })
    hub.emit({ type: 'foregroundEnter' })
    await vi.advanceTimersByTimeAsync(10)
    expect(rebuilds).toBe(1)
  })
})
