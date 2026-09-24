import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviders } from '../src/app/providers'
import { ConversationSession, type SessionSnapshot } from '../src/app/session'
import { DEFAULT_SETTINGS, type Settings } from '../src/settings/schema'

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

  it('reports a clear error in live mode until providers exist', async () => {
    settings.mode = 'live'
    await session.start()
    expect(last.phase).toBe('idle')
    expect(last.error?.kind).toBe('unsupported')
  })
})
