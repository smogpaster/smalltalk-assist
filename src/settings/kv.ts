import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { BridgeQueue } from '../bridge/queue'

/** Minimal persistent key-value store. Values are strings. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

const PREFIX = 'sta.'

/**
 * SDK storage – the only store that reliably survives app restarts inside the
 * Even app WebView. Calls share the BLE/bridge channel, so they go through
 * the bridge queue.
 */
export class BridgeKeyValueStore implements KeyValueStore {
  constructor(
    private readonly bridge: Pick<EvenAppBridge, 'getLocalStorage' | 'setLocalStorage'>,
    private readonly queue: BridgeQueue,
  ) {}

  async get(key: string): Promise<string | null> {
    const value = await this.queue.run(() => this.bridge.getLocalStorage(PREFIX + key))
    return value === '' ? null : value
  }

  async set(key: string, value: string): Promise<void> {
    const ok = await this.queue.run(() => this.bridge.setLocalStorage(PREFIX + key, value))
    if (!ok) throw new Error(`Storage write failed for ${key}`)
  }

  async remove(key: string): Promise<void> {
    // The SDK has no delete; an empty string reads back as "missing".
    await this.set(key, '')
  }
}

/** Browser preview only (plain `vite` in a desktop browser, no Even app). */
export class LocalKeyValueStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    return window.localStorage.getItem(PREFIX + key)
  }
  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(PREFIX + key, value)
  }
  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(PREFIX + key)
  }
}

export class MemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>()
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null
  }
  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }
}
