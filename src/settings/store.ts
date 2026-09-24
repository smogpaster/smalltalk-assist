import type { KeyValueStore } from './kv'
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from './schema'

const SETTINGS_KEY = 'settings'

type Listener = (settings: Settings) => void

/**
 * Holds the current settings in memory and persists changes debounced, so a
 * burst of UI edits costs one storage write (storage shares the bridge
 * channel with rendering).
 */
export class SettingsStore {
  private current: Settings = { ...DEFAULT_SETTINGS }
  private listeners = new Set<Listener>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly kv: KeyValueStore,
    private readonly saveDelayMs = 400,
  ) {}

  async load(): Promise<Settings> {
    try {
      const raw = await this.kv.get(SETTINGS_KEY)
      this.current = migrateSettings(raw ? JSON.parse(raw) : null)
    } catch (err) {
      console.warn('[settings] load failed, using defaults', (err as Error).message)
      this.current = { ...DEFAULT_SETTINGS }
    }
    return this.get()
  }

  get(): Settings {
    return { ...this.current }
  }

  update(patch: Partial<Omit<Settings, 'version'>>): Settings {
    this.current = migrateSettings({ ...this.current, ...patch })
    for (const listener of this.listeners) listener(this.get())
    this.scheduleSave()
    return this.get()
  }

  /** Back to defaults (incl. onboarding), written immediately. */
  async reset(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.current = { ...DEFAULT_SETTINGS }
    await this.persist()
    for (const listener of this.listeners) listener(this.get())
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Writes pending changes now (call on background/exit). */
  async flush(): Promise<void> {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    await this.persist()
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.persist()
    }, this.saveDelayMs)
  }

  private async persist() {
    try {
      await this.kv.set(SETTINGS_KEY, JSON.stringify(this.current))
    } catch (err) {
      console.warn('[settings] save failed', (err as Error).message)
    }
  }
}
