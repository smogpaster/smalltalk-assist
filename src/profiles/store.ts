import type { KeyValueStore } from '../settings/kv'
import { EMPTY_PERSON, NAME_MAX, TONES, clip, type OtherPerson, type Profile, type Tone } from './model'

const STORAGE_KEY = 'profiles'
const VERSION = 1

interface StoredData {
  version: number
  activeId: string
  profiles: Profile[]
  person: OtherPerson
}

/** Names for the starter profiles, in the UI language at first start. */
export interface DefaultProfileNames {
  networking: string
  family: string
  client: string
}

/**
 * Profiles and the current conversation partner. Stored locally via the Even
 * app storage (this is setup the user typed, not conversation content).
 * Writes are debounced; the UI edits fields as the user types.
 */
export class ProfileStore {
  private data: StoredData = { version: VERSION, activeId: '', profiles: [], person: { ...EMPTY_PERSON } }
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly kv: KeyValueStore,
    private readonly saveDelayMs = 500,
  ) {}

  async load(defaults: DefaultProfileNames): Promise<void> {
    let raw: unknown = null
    try {
      const text = await this.kv.get(STORAGE_KEY)
      raw = text ? JSON.parse(text) : null
    } catch {
      raw = null
    }
    this.data = sanitize(raw)
    if (this.data.profiles.length === 0) {
      this.data.profiles = [
        newProfile(defaults.networking, 'professional'),
        newProfile(defaults.family, 'warm'),
        newProfile(defaults.client, 'professional'),
      ]
      this.data.activeId = this.data.profiles[0].id
      this.scheduleSave()
    }
    if (!this.data.profiles.some(p => p.id === this.data.activeId)) this.data.activeId = this.data.profiles[0].id
  }

  list(): readonly Profile[] {
    return this.data.profiles
  }

  active(): Profile {
    return this.data.profiles.find(p => p.id === this.data.activeId) ?? this.data.profiles[0]
  }

  setActive(id: string): void {
    if (!this.data.profiles.some(p => p.id === id)) return
    this.data.activeId = id
    this.scheduleSave()
  }

  create(name: string): Profile {
    const profile = newProfile(clip(name, NAME_MAX) || '…', 'casual')
    this.data.profiles.push(profile)
    this.data.activeId = profile.id
    this.scheduleSave()
    return profile
  }

  update(id: string, patch: Partial<Omit<Profile, 'id'>>): void {
    const profile = this.data.profiles.find(p => p.id === id)
    if (!profile) return
    Object.assign(profile, sanitizeProfile({ ...profile, ...patch }))
    this.scheduleSave()
  }

  /** The last remaining profile cannot be removed. */
  remove(id: string): boolean {
    if (this.data.profiles.length <= 1) return false
    this.data.profiles = this.data.profiles.filter(p => p.id !== id)
    if (this.data.activeId === id) this.data.activeId = this.data.profiles[0].id
    this.scheduleSave()
    return true
  }

  person(): OtherPerson {
    return { ...this.data.person }
  }

  updatePerson(patch: Partial<OtherPerson>): void {
    this.data.person = sanitizePerson({ ...this.data.person, ...patch })
    this.scheduleSave()
  }

  clearPerson(): void {
    this.data.person = { ...EMPTY_PERSON }
    this.scheduleSave()
  }

  async flush(): Promise<void> {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    await this.persist()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.persist()
    }, this.saveDelayMs)
  }

  private async persist(): Promise<void> {
    try {
      await this.kv.set(STORAGE_KEY, JSON.stringify(this.data))
    } catch (err) {
      console.warn('[profiles] save failed', (err as Error).message)
    }
  }
}

function newProfile(name: string, tone: Tone): Profile {
  return { id: randomId(), name, tone, aboutMe: '', avoidTopics: '', goal: '' }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function sanitizeProfile(raw: Partial<Profile>): Profile {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : randomId(),
    name: clip(raw.name, NAME_MAX),
    tone: TONES.includes(raw.tone as Tone) ? (raw.tone as Tone) : 'casual',
    aboutMe: clip(raw.aboutMe),
    avoidTopics: clip(raw.avoidTopics),
    goal: clip(raw.goal),
  }
}

function sanitizePerson(raw: Partial<OtherPerson>): OtherPerson {
  return {
    name: clip(raw.name, NAME_MAX),
    relation: clip(raw.relation),
    interests: clip(raw.interests),
    mutualAcquaintances: clip(raw.mutualAcquaintances),
    bringUp: clip(raw.bringUp),
    avoid: clip(raw.avoid),
  }
}

/** Accepts stored data of any shape and returns something valid. */
function sanitize(raw: unknown): StoredData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoredData>
  const profiles = Array.isArray(r.profiles) ? r.profiles.filter(p => p && typeof p === 'object').map(p => sanitizeProfile(p)) : []
  return {
    version: VERSION,
    activeId: typeof r.activeId === 'string' ? r.activeId : '',
    profiles,
    person: sanitizePerson(r.person && typeof r.person === 'object' ? r.person : {}),
  }
}
