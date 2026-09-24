import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProvidersFactory } from '../src/app/providers'
import { ConversationSession, type SessionSnapshot } from '../src/app/session'
import { DEFAULT_SETTINGS, type Settings } from '../src/settings/schema'

const createProviders = createProvidersFactory({ get: () => null })

describe('ConversationSession in demo mode', () => {
  let settings: Settings
  let session: ConversationSession
  let last: SessionSnapshot

  beforeEach(() => {
    vi.useFakeTimers()
    settings = { ...DEFAULT_SETTINGS, mode: 'demo', demoLanguage: 'de' }
    session = new ConversationSession({ audio: null, settings: () => settings, createProviders })
    session.subscribe(s => (last = s))
  })
  afterEach(async () => {
    await session.stop()
    vi.useRealTimers()
  })

  it('plays the script, maps speakers and produces suggestions without keys or audio', async () => {
    await session.start()
    expect(last.phase).toBe('recording')
    expect(last.demo).toBe(true)

    await vi.advanceTimersByTimeAsync(8000)
    const other = last.transcript.find(s => s.isFinal && s.text.startsWith('Hallo, ich glaube'))
    expect(other?.speaker).toBe('other')
    expect(last.suggestions.length).toBe(3)
    expect(last.suggestions[0].text).toContain('Miriam')

    await vi.advanceTimersByTimeAsync(4000)
    const self = last.transcript.find(s => s.isFinal && s.text.startsWith('Freut mich'))
    expect(self?.speaker).toBe('self')
  })

  it('forgets transcript and suggestions on stop', async () => {
    await session.start()
    await vi.advanceTimersByTimeAsync(8000)
    expect(last.transcript.length).toBeGreaterThan(0)
    await session.stop()
    expect(last.phase).toBe('idle')
    expect(last.transcript).toHaveLength(0)
    expect(last.suggestions).toHaveLength(0)
  })

  it('pages through suggestions and supports quiet mode', async () => {
    settings.suggestionsPerPage = 1
    await session.start()
    await vi.advanceTimersByTimeAsync(8000)
    session.movePage(1)
    expect(last.page).toBe(1)
    session.movePage(5)
    expect(last.page).toBe(2)
    session.toggleQuiet()
    expect(last.phase).toBe('quiet')
    session.movePage(-1)
    expect(last.page).toBe(2)
    session.toggleQuiet()
    expect(last.phase).toBe('recording')
  })

  it('reports a clear error in live mode without provider or key', async () => {
    settings.mode = 'live'
    await session.start()
    expect(last.phase).toBe('idle')
    expect(last.error?.kind).toBe('not_configured')
  })
})

describe('ConversationSession reconnects', () => {
  it('does not reconnect after a credit/key error followed by the server closing', async () => {
    vi.useFakeTimers()
    const { ProviderError } = await import('../src/core/errors')
    let starts = 0
    let callbacks: import('../src/stt/types').SttCallbacks | null = null
    const stt: import('../src/stt/types').SttProvider = {
      id: 'fake',
      capabilities: { streaming: true, diarization: false, languages: ['de'], autoDetect: false, transports: ['websocket'] },
      testConnection: async () => {},
      start: async (_o, cb) => {
        starts++
        callbacks = cb
        return { sendPcm() {}, async close() {} }
      },
    }
    const audio = { active: true, start: async () => true, stop: async () => {}, rearm: async () => {} }
    const session = new ConversationSession({
      audio,
      settings: () => ({ ...DEFAULT_SETTINGS, mode: 'live' }),
      createProviders: () => ({ stt, llm: null, needsAudio: true, language: 'de', diarization: false }),
    })
    let last!: SessionSnapshot
    session.subscribe(s => (last = s))
    await session.start()
    callbacks!.onError(new ProviderError('fake', 'quota', 'balance exhausted', 402))
    callbacks!.onError(new ProviderError('fake', 'network', 'Connection closed (1000)'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(starts).toBe(1)
    expect(last.error?.kind).toBe('quota')
    expect(last.reconnecting).toBe(false)

    // A plain network drop still reconnects, and gives up after three attempts.
    await session.stop()
    starts = 0
    await session.start()
    for (let i = 0; i < 5; i++) {
      callbacks!.onError(new ProviderError('fake', 'network', 'dropped'))
      await vi.advanceTimersByTimeAsync(7000)
    }
    expect(starts).toBe(4)
    await session.stop()
    vi.useRealTimers()
  })
})
