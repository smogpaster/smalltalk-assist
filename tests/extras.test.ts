import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMenu, MenuId } from '../src/app/menu'
import { ConversationSession, type SessionSnapshot } from '../src/app/session'
import { ProviderError } from '../src/core/errors'
import type { TranscriptSegment } from '../src/core/types'
import { BODY_INNER_WIDTH, BODY_LINES, buildGlassesView } from '../src/display/layout'
import { lineCount } from '../src/display/text'
import { SuggestionEngine } from '../src/engine/engine'
import { parseNames } from '../src/engine/format'
import { buildSpecialRequest, buildSuggestionRequest } from '../src/engine/prompt'
import { Transcript } from '../src/engine/transcript'
import { createTranslator } from '../src/i18n'
import type { LlmProvider, LlmRequest } from '../src/llm/types'
import { DEFAULT_SETTINGS, EXTRA_IDS, type Settings } from '../src/settings/schema'
import type { SttCallbacks, SttProvider } from '../src/stt/types'

const t = createTranslator('de')

class ScriptedLlm implements LlmProvider {
  readonly id = 'fake'
  readonly model = 'fake'
  calls: LlmRequest[] = []
  constructor(private answer: string) {}
  async testConnection() {}
  async complete(request: LlmRequest): Promise<string> {
    this.calls.push(request)
    return this.answer
  }
}

describe('prompt features', () => {
  const segments: TranscriptSegment[] = [{ id: '1', text: 'Ich bin Miriam.', isFinal: true, speaker: 'other', startMs: 0, endMs: 1 }]

  it('adds recall, terms and names instructions only when enabled', () => {
    const plain = buildSuggestionRequest({ segments, outputLanguage: 'de', count: 3, withSpeakers: true })
    expect(plain.system).not.toMatch(/kind "b"|kind "d"|"n":/)
    const all = buildSuggestionRequest({ segments, outputLanguage: 'de', count: 3, withSpeakers: true, features: { names: true, recall: true, terms: true } })
    expect(all.system).toContain('kind "b"')
    expect(all.system).toContain('kind "d"')
    expect(all.system).toContain('"n":[]')
    expect(all.maxTokens).toBeGreaterThan(plain.maxTokens)
  })

  it('builds the special requests with their own kind', () => {
    expect(buildSpecialRequest('topic', { segments, outputLanguage: 'de', count: 3, withSpeakers: true }).system).toContain('"k":"t"')
    expect(buildSpecialRequest('exit', { segments, outputLanguage: 'de', count: 3, withSpeakers: true }).system).toContain('"k":"x"')
    expect(buildSpecialRequest('recap', { segments, outputLanguage: 'de', count: 3, withSpeakers: true }).system).toContain('"k":"h"')
    expect(buildSpecialRequest('lull', { segments: [], outputLanguage: 'en', count: 3, withSpeakers: false }).messages[0].content).toContain('(nothing said yet)')
  })

  it('parses names and ignores junk', () => {
    expect(parseNames('{"s":[],"n":[{"n":"Miriam","i":"Solar-Start-up"},{"n":""},{"x":1}]}')).toEqual([{ name: 'Miriam', note: 'Solar-Start-up' }])
    expect(parseNames('{"s":[]}')).toEqual([])
  })
})

describe('engine extras', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('asks for openers after a lull, once per silence', async () => {
    const llm = new ScriptedLlm('{"s":[{"k":"t","t":"Wie war dein Wochenende?"}]}')
    const transcript = new Transcript()
    const results: string[] = []
    const engine = new SuggestionEngine({
      llm,
      transcript,
      outputLanguage: () => 'de',
      count: () => 3,
      lullMs: () => 15_000,
      timing: () => ({ minIntervalMs: 0, maxPerMinute: 0 }),
      onSuggestions: s => results.push(s[0].text),
      onError: () => {},
    })
    const seg: TranscriptSegment = { id: '1', text: 'Ja, das stimmt.', isFinal: true, speaker: 'self', startMs: 0, endMs: 1000 }
    transcript.upsert(seg)
    engine.onSegment(seg)
    await vi.advanceTimersByTimeAsync(4000) // silence trigger after my own sentence
    const before = llm.calls.length
    await vi.advanceTimersByTimeAsync(11_000)
    expect(llm.calls.length).toBe(before + 1)
    expect(llm.calls.at(-1)!.system).toContain('stalled')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(llm.calls.length).toBe(before + 1)
    engine.stop()
  })

  it('reports names found in the answer', async () => {
    const llm = new ScriptedLlm('{"s":[{"k":"q","t":"Hallo Miriam!"}],"n":[{"n":"Miriam","i":"Investorin"}]}')
    const transcript = new Transcript()
    const names: string[] = []
    const engine = new SuggestionEngine({
      llm,
      transcript,
      outputLanguage: () => 'de',
      count: () => 3,
      features: () => ({ names: true }),
      timing: () => ({ minIntervalMs: 0, maxPerMinute: 0, minNewChars: 0 }),
      onSuggestions: () => {},
      onNames: n => names.push(...n.map(x => x.name)),
      onError: () => {},
    })
    const seg: TranscriptSegment = { id: '1', text: 'Ich bin Miriam.', isFinal: true, speaker: 'other', startMs: 0, endMs: 1000 }
    transcript.upsert(seg)
    engine.onSegment(seg)
    await vi.advanceTimersByTimeAsync(500)
    expect(names).toEqual(['Miriam'])
    engine.stop()
  })
})

describe('session extras', () => {
  let callbacks: SttCallbacks
  let settings: Settings
  let last: SessionSnapshot
  let session: ConversationSession
  let llm: ScriptedLlm

  beforeEach(async () => {
    vi.useFakeTimers()
    settings = { ...DEFAULT_SETTINGS, mode: 'live', extras: { ...DEFAULT_SETTINGS.extras, talkShare: true, names: true, topicChange: true } }
    const stt: SttProvider = {
      id: 'fake',
      capabilities: { streaming: true, diarization: true, languages: ['de'], autoDetect: false, transports: ['websocket'] },
      testConnection: async () => {},
      start: async (_o, cb) => {
        callbacks = cb
        return { sendPcm() {}, async close() {} }
      },
    }
    llm = new ScriptedLlm('{"s":[{"k":"t","t":"Apropos Reisen …"}],"n":[{"n":"Miriam","i":"Seglerin"}]}')
    session = new ConversationSession({
      audio: { active: true, start: async () => true, stop: async () => {}, rearm: async () => {} },
      settings: () => settings,
      createProviders: () => ({ stt, llm, needsAudio: true, language: 'de', diarization: true, selfLabel: 'me' }),
    })
    session.subscribe(s => (last = s))
    await session.start()
  })
  afterEach(async () => {
    await session.stop()
    vi.useRealTimers()
  })

  const say = (id: string, label: string, seconds: number, startSec: number) =>
    callbacks.onResult({ id, text: 'Ein etwas längerer Satz zum Testen.', isFinal: true, speakerLabel: label, startMs: startSec * 1000, endMs: (startSec + seconds) * 1000 })

  it('warns when the wearer talks most of the time, and clears again', () => {
    say('1', 'me', 40, 0)
    say('2', 'them', 10, 40)
    expect(last.talkShareWarning).toBe(80)
    say('3', 'them', 30, 50)
    expect(last.talkShareWarning).toBeNull()
  })

  it('runs a topic change on demand and collects names in memory only', async () => {
    expect(session.requestSpecial('topic')).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(llm.calls.at(-1)!.system).toContain('change the topic')
    expect(last.suggestions[0]).toEqual({ kind: 'topic', text: 'Apropos Reisen …' })

    say('1', 'them', 2, 0)
    // The topic request counts towards the 6 s minimum interval.
    await vi.advanceTimersByTimeAsync(7000)
    expect(last.names).toEqual([{ name: 'Miriam', note: 'Seglerin' }])
    await session.stop()
    expect(last.names).toEqual([])
  })

  it('ignores special requests without an LLM or session', async () => {
    await session.stop()
    expect(session.requestSpecial('exit')).toBe(false)
    void ProviderError
  })
})

describe('menu and glasses', () => {
  it('lists only enabled extras, back item last', () => {
    expect(buildMenu(t).map(i => i.id)).toEqual([MenuId.toggleSession, MenuId.quiet, MenuId.back])
    const all = Object.fromEntries(EXTRA_IDS.map(id => [id, true])) as Settings['extras']
    const ids = buildMenu(t, all).map(i => i.id)
    expect(ids).toEqual([MenuId.toggleSession, MenuId.quiet, MenuId.topic, MenuId.exitLine, MenuId.recap, MenuId.names, MenuId.back])
    expect(ids.length).toBeLessThanOrEqual(10)
  })

  it('shows the talk-share hint above suggestions without overflowing', () => {
    const suggestions = [1, 2, 3].map(i => ({ kind: 'question' as const, text: `Eine ziemlich lange Frage Nummer ${i} die umbrechen muss und noch länger wird`.repeat(2) }))
    const view = buildGlassesView({ phase: 'recording', demo: false, suggestions, page: 0, perPage: 3, hint: t('extra.talkShare.hint', { pct: 78 }) }, t)
    expect(view.body.startsWith('• Du redest viel (78 %)')).toBe(true)
    expect(lineCount(view.body, BODY_INNER_WIDTH)).toBeLessThanOrEqual(BODY_LINES)
  })
})

describe('explicit requests win over regular suggestions', () => {
  it('a sentence ending during an exit request neither aborts nor overwrites it', async () => {
    vi.useFakeTimers()
    let callbacks!: SttCallbacks
    const calls: LlmRequest[] = []
    const llm: LlmProvider = {
      id: 'slow',
      model: 'm',
      testConnection: async () => {},
      complete: request =>
        new Promise((resolve, reject) => {
          calls.push(request)
          const exit = request.system.includes('end the conversation')
          const timer = setTimeout(() => resolve(exit ? '{"s":[{"k":"x","t":"Ich muss leider los."}]}' : '{"s":[{"k":"q","t":"Und dann?"}]}'), 2000)
          request.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new ProviderError('slow', 'aborted', 'aborted'))
          })
        }),
    }
    const stt: SttProvider = {
      id: 'fake',
      capabilities: { streaming: true, diarization: true, languages: ['de'], autoDetect: false, transports: ['websocket'] },
      testConnection: async () => {},
      start: async (_o, cb) => {
        callbacks = cb
        return { sendPcm() {}, async close() {} }
      },
    }
    const settings = { ...DEFAULT_SETTINGS, mode: 'live' as const, minIntervalSec: 3 as const }
    const session = new ConversationSession({
      audio: { active: true, start: async () => true, stop: async () => {}, rearm: async () => {} },
      settings: () => settings,
      createProviders: () => ({ stt, llm, needsAudio: true, language: 'de', diarization: true, selfLabel: 'me' }),
    })
    let last!: SessionSnapshot
    session.subscribe(s => (last = s))
    await session.start()

    session.requestSpecial('exit')
    await vi.advanceTimersByTimeAsync(500)
    callbacks.onResult({ id: '1', text: 'Und dann sind wir noch zum Hafen gelaufen.', isFinal: true, speakerLabel: 'them', startMs: 0, endMs: 2000 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(last.suggestions[0]).toEqual({ kind: 'exit', text: 'Ich muss leider los.' })

    // The regular request runs afterwards, but its result waits for the hold.
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(2)
    expect(last.suggestions[0].kind).toBe('exit')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(last.suggestions[0]).toEqual({ kind: 'question', text: 'Und dann?' })

    await session.stop()
    vi.useRealTimers()
  })
})
