import type { KeyValueStore } from './kv'

/**
 * API keys, stored only on this device via SDK storage – one storage entry
 * per provider, separate from the settings object, so keys never appear in
 * a settings dump, a trace or a log line. They are sent only to the provider
 * they belong to (see the adapters).
 */
export class KeyStore {
  private cache = new Map<string, string>()

  constructor(private readonly kv: KeyValueStore) {}

  async load(providerIds: readonly string[]): Promise<void> {
    for (const id of providerIds) {
      try {
        // Clean on load too: keys saved before cleaning existed may contain invisible characters.
        const value = cleanKey((await this.kv.get(storageKey(id))) ?? '')
        if (value) this.cache.set(id, value)
      } catch {
        /* treat as missing */
      }
    }
  }

  get(providerId: string): string | null {
    return this.cache.get(providerId) ?? null
  }

  has(providerId: string): boolean {
    return this.cache.has(providerId)
  }

  async set(providerId: string, key: string): Promise<void> {
    const trimmed = cleanKey(key)
    if (!trimmed) return this.remove(providerId)
    this.cache.set(providerId, trimmed)
    await this.kv.set(storageKey(providerId), trimmed)
  }

  async remove(providerId: string): Promise<void> {
    this.cache.delete(providerId)
    await this.kv.remove(storageKey(providerId))
  }
}

/**
 * API keys are printable ASCII. Pasting on iOS can add invisible characters
 * (zero-width or non-breaking spaces, line breaks); fetch() then refuses the
 * header value and it looks like a network error. Strip everything else.
 */
export function cleanKey(key: string): string {
  return key.replace(/[^\x21-\x7E]/g, '')
}

function storageKey(providerId: string): string {
  return `key.${providerId}`
}

/** For display only: "••••3f9a". */
export function maskKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`
}
