import { describe, expect, it, vi } from 'vitest'
import { estimateHourlyCost } from '../src/costs/estimate'
import { buildGlassesView } from '../src/display/layout'
import { createTranslator } from '../src/i18n'
import { ProfileStore } from '../src/profiles/store'
import { KeyStore } from '../src/settings/keys'
import { MemoryKeyValueStore } from '../src/settings/kv'
import { DEFAULT_SETTINGS, type Settings } from '../src/settings/schema'
import { SettingsStore } from '../src/settings/store'

const live = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, mode: 'live', ...patch })

describe('cost estimate', () => {
  it('adds STT per hour and LLM tokens for the default models', () => {
    const e = estimateHourlyCost(live({ sttProvider: 'soniox', llmProvider: 'anthropic' }))
    expect(e.stt).toBeCloseTo(0.12)
    // 120 requests × (1200 in × $1 + 150 out × $5) / 1M
    expect(e.llm).toBeCloseTo(0.234)
    expect(e.total).toBeCloseTo(0.354)
  })

  it('respects rate limits, diarization add-ons and auto language', () => {
    const e = estimateHourlyCost(live({ sttProvider: 'deepgram', conversationLanguage: 'auto', diarization: true, maxPerMinute: 3, llmProvider: 'openai' }))
    expect(e.requestsPerHour).toBe(120)
    expect(e.stt).toBeCloseTo(0.348 + 0.12)
    const slow = estimateHourlyCost(live({ minIntervalSec: 20, llmProvider: 'openai' }))
    expect(slow.requestsPerHour).toBe(120)
    expect(estimateHourlyCost(live({ minIntervalSec: 20, maxPerMinute: 3 })).requestsPerHour).toBe(120)
  })

  it('reports unknown when a price is not known', () => {
    expect(estimateHourlyCost(live({ sttProvider: 'speechmatics', llmProvider: 'anthropic' })).total).toBeNull()
    expect(estimateHourlyCost(live({ sttProvider: 'soniox', llmProvider: 'groq', llmModels: { groq: 'x' } })).llm).toBeNull()
    expect(estimateHourlyCost(live({ sttProvider: 'soniox', llmProvider: 'anthropic', llmModels: { anthropic: 'claude-sonnet-5' } })).llm).toBeNull()
  })
})

describe('onboarding on the glasses', () => {
  it('asks to finish setup on the phone first', () => {
    const view = buildGlassesView({ phase: 'idle', demo: true, suggestions: [], page: 0, perPage: 2, needsSetup: true }, createTranslator('de'))
    expect(view.body).toContain('Einrichtung')
  })
})

describe('delete all data', () => {
  it('resets settings, profiles and keys', async () => {
    vi.useFakeTimers()
    const kv = new MemoryKeyValueStore()
    const settings = new SettingsStore(kv, 10)
    settings.update({ onboardingDone: true, mode: 'live' })
    const profiles = new ProfileStore(kv, 10)
    const names = { networking: 'N', family: 'F', client: 'K' }
    await profiles.load(names)
    profiles.create('Date')
    profiles.updatePerson({ name: 'Miriam' })
    const keys = new KeyStore(kv)
    await keys.set('soniox', 'sk-1')
    await vi.advanceTimersByTimeAsync(20)

    await settings.reset()
    await profiles.reset(names)
    await keys.remove('soniox')

    expect(settings.get()).toEqual(DEFAULT_SETTINGS)
    expect(profiles.list().map(p => p.name)).toEqual(['N', 'F', 'K'])
    expect(profiles.person().name).toBe('')
    expect(keys.get('soniox')).toBeNull()
    expect(kv.data.get('key.soniox') ?? null).toBeNull()
    vi.useRealTimers()
  })
})
