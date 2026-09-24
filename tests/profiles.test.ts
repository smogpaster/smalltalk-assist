import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSuggestionRequest } from '../src/engine/prompt'
import { buildPromptContext } from '../src/profiles/context'
import { EMPTY_PERSON, FIELD_MAX } from '../src/profiles/model'
import { ProfileStore } from '../src/profiles/store'
import { MemoryKeyValueStore } from '../src/settings/kv'

const defaults = { networking: 'Networking', family: 'Familienfeier', client: 'Kundentermin' }

describe('ProfileStore', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('creates three starter profiles on first load and persists them', async () => {
    const kv = new MemoryKeyValueStore()
    const store = new ProfileStore(kv, 100)
    await store.load(defaults)
    expect(store.list().map(p => [p.name, p.tone])).toEqual([
      ['Networking', 'professional'],
      ['Familienfeier', 'warm'],
      ['Kundentermin', 'professional'],
    ])
    expect(store.active().name).toBe('Networking')
    await vi.advanceTimersByTimeAsync(100)
    expect(JSON.parse(kv.data.get('profiles')!).profiles).toHaveLength(3)
  })

  it('edits, switches, creates and deletes, keeping at least one profile', async () => {
    const kv = new MemoryKeyValueStore()
    const store = new ProfileStore(kv, 100)
    await store.load(defaults)
    const family = store.list()[1]
    store.setActive(family.id)
    store.update(family.id, { aboutMe: 'Ich koche gern.', tone: 'casual' })
    expect(store.active()).toMatchObject({ name: 'Familienfeier', aboutMe: 'Ich koche gern.', tone: 'casual' })

    const created = store.create('Date')
    expect(store.active().id).toBe(created.id)
    for (const p of [...store.list()]) store.remove(p.id)
    expect(store.list()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(100)
    const reloaded = new ProfileStore(kv)
    await reloaded.load(defaults)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.active().id).toBe(store.active().id)
  })

  it('caps field lengths and repairs corrupted data', async () => {
    const kv = new MemoryKeyValueStore()
    await kv.set('profiles', JSON.stringify({ profiles: [{ id: 'a', name: 'X', tone: 'rude', aboutMe: 'y'.repeat(5000) }, 'junk'], activeId: 'missing' }))
    const store = new ProfileStore(kv)
    await store.load(defaults)
    expect(store.list()).toHaveLength(1)
    expect(store.active()).toMatchObject({ id: 'a', tone: 'casual' })
    expect(store.active().aboutMe).toHaveLength(FIELD_MAX)
  })

  it('stores and clears the conversation partner', async () => {
    const store = new ProfileStore(new MemoryKeyValueStore())
    await store.load(defaults)
    store.updatePerson({ name: 'Miriam', interests: 'Segeln' })
    expect(store.person()).toMatchObject({ name: 'Miriam', interests: 'Segeln' })
    store.clearPerson()
    expect(store.person()).toEqual(EMPTY_PERSON)
  })
})

describe('prompt context', () => {
  const profile = {
    id: 'p',
    name: 'Networking',
    tone: 'professional' as const,
    aboutMe: 'Ingenieur bei einem Solar-Start-up.\nSegle am Wochenende.',
    avoidTopics: 'Politik',
    goal: 'Kontakte für Finanzierung',
  }

  it('builds background lines and an avoid list', () => {
    const context = buildPromptContext(profile, { ...EMPTY_PERSON, name: 'Miriam', relation: 'Investorin', avoid: 'ihr Ex-Unternehmen' })
    expect(context.lines).toEqual([
      'Tone of the wearer: professional and polite.',
      "Wearer's goal for this conversation: Kontakte für Finanzierung",
      'About the wearer (use when it fits naturally): Ingenieur bei einem Solar-Start-up.; Segle am Wochenende.',
      'Conversation partner: Miriam (Investorin)',
    ])
    expect(context.avoid).toEqual(['Politik', 'ihr Ex-Unternehmen'])
  })

  it('puts context into the system prompt with the avoid rule', () => {
    const request = buildSuggestionRequest({
      segments: [{ id: '1', text: 'Hallo', isFinal: true, speaker: 'other', startMs: 0, endMs: 1 }],
      outputLanguage: 'de',
      count: 3,
      withSpeakers: true,
      context: buildPromptContext(profile, EMPTY_PERSON),
    })
    expect(request.system).toContain('- Tone of the wearer: professional and polite.')
    expect(request.system).toContain('Never bring up or steer toward these topics: Politik')
    expect(request.messages[0].content).not.toContain('Politik')
  })

  it('adds nothing for an empty person', () => {
    expect(buildPromptContext(undefined, EMPTY_PERSON)).toEqual({ lines: [], avoid: [] })
  })
})
