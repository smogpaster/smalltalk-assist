import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../src/core/errors'
import type { Suggestion, TranscriptSegment } from '../src/core/types'
import { SuggestionEngine, type EngineTiming } from '../src/engine/engine'
import { Transcript } from '../src/engine/transcript'
import type { LlmProvider, LlmRequest } from '../src/llm/types'

function seg(id: string, text: string, speaker: TranscriptSegment['speaker'], isFinal = true, endMs = 0): TranscriptSegment {
  return { id, text, speaker, isFinal, startMs: endMs, endMs }
}

class FakeLlm implements LlmProvider {
  readonly id = 'fake'
  readonly model = 'fake'
  calls: LlmRequest[] = []
  response = '{"s":[{"k":"q","t":"Und du?"},{"k":"r","t":"Ich auch."}]}'
  delayMs = 100
  error: ProviderError | null = null

  async testConnection() {}

  complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string> {
    this.calls.push(request)
    return new Promise((resolve, reject) => {
      // Stream in two halves to exercise partial parsing.
      const half = setTimeout(() => onDelta?.(this.response.slice(0, this.response.indexOf('},') + 1)), this.delayMs / 2)
      const timer = setTimeout(() => {
        if (this.error) return reject(this.error)
        onDelta?.(this.response.slice(this.response.indexOf('},') + 1))
        resolve(this.response)
      }, this.delayMs)
      request.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        clearTimeout(half)
        reject(new ProviderError('fake', 'aborted', 'aborted'))
      })
    })
  }
}

describe('SuggestionEngine', () => {
  let llm: FakeLlm
  let transcript: Transcript
  let results: { suggestions: Suggestion[]; partial: boolean }[]
  let errors: ProviderError[]
  let timing: Partial<EngineTiming>
  let paused: boolean
  let engine: SuggestionEngine

  beforeEach(() => {
    vi.useFakeTimers()
    llm = new FakeLlm()
    transcript = new Transcript()
    results = []
    errors = []
    paused = false
    timing = { pauseMs: 500, silenceMs: 3000, minIntervalMs: 0, maxPerMinute: 0, minNewChars: 0 }
    engine = new SuggestionEngine({
      llm,
      transcript,
      outputLanguage: () => 'de',
      count: () => 2,
      timing: () => timing,
      paused: () => paused,
      onSuggestions: (suggestions, partial) => results.push({ suggestions, partial }),
      onError: e => errors.push(e),
    })
  })
  afterEach(() => {
    engine.stop()
    vi.useRealTimers()
  })

  const feed = (s: TranscriptSegment) => {
    transcript.upsert(s)
    engine.onSegment(s)
  }

  it('asks after the other person finished and a pause passed', async () => {
    feed(seg('1', 'Ich war im Urlaub.', 'other'))
    await vi.advanceTimersByTimeAsync(499)
    expect(llm.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0].messages[0].content).toContain('THEM: Ich war im Urlaub.')
    expect(llm.calls[0].system).toContain('German')
  })

  it('streams: shows the first suggestion before the answer is complete', async () => {
    feed(seg('1', 'Hallo.', 'other'))
    await vi.advanceTimersByTimeAsync(500 + 50)
    expect(results).toEqual([{ suggestions: [{ kind: 'question', text: 'Und du?' }], partial: true }])
    await vi.advanceTimersByTimeAsync(50)
    expect(results.at(-1)).toEqual({
      suggestions: [{ kind: 'question', text: 'Und du?' }, { kind: 'reply', text: 'Ich auch.' }],
      partial: false,
    })
  })

  it('uses the longer silence delay after my own sentence', async () => {
    feed(seg('1', 'Ich erzähle was.', 'self'))
    await vi.advanceTimersByTimeAsync(2999)
    expect(llm.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(llm.calls).toHaveLength(1)
  })

  it('postpones while someone keeps talking', async () => {
    feed(seg('1', 'Erster Satz.', 'other'))
    await vi.advanceTimersByTimeAsync(300)
    feed(seg('2', 'und dann', 'other', false))
    await vi.advanceTimersByTimeAsync(5000)
    expect(llm.calls).toHaveLength(0)
  })

  it('aborts a stale request when a newer trigger fires', async () => {
    llm.delayMs = 2000
    feed(seg('1', 'Erstens.', 'other'))
    await vi.advanceTimersByTimeAsync(500)
    feed(seg('2', 'Zweitens.', 'other'))
    await vi.advanceTimersByTimeAsync(500)
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[0].signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(results.filter(r => !r.partial)).toHaveLength(1)
    expect(errors).toHaveLength(0)
  })

  it('rate limits and fires the delayed trigger once allowed', async () => {
    timing.minIntervalMs = 6000
    feed(seg('1', 'Erstens.', 'other'))
    await vi.advanceTimersByTimeAsync(600)
    feed(seg('2', 'Zweitens.', 'other'))
    await vi.advanceTimersByTimeAsync(600)
    expect(llm.calls).toHaveLength(1)
    // First request ran at 500 ms, so the next one is allowed at 6500 ms.
    await vi.advanceTimersByTimeAsync(5200)
    expect(llm.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1].messages[0].content).toContain('Zweitens.')
  })

  it('respects the per-minute cap', async () => {
    timing.maxPerMinute = 2
    for (let i = 0; i < 4; i++) {
      feed(seg(String(i), `Satz ${i}.`, 'other'))
      await vi.advanceTimersByTimeAsync(700)
    }
    expect(llm.calls).toHaveLength(2)
  })

  it('skips when nothing new was said', async () => {
    timing.minNewChars = 12
    feed(seg('1', 'Ein langer erster Satz.', 'other'))
    await vi.advanceTimersByTimeAsync(700)
    feed(seg('2', 'Ja.', 'other'))
    await vi.advanceTimersByTimeAsync(700)
    expect(llm.calls).toHaveLength(1)
  })

  it('caps the transcript sent per request', async () => {
    timing.maxChars = 30
    feed(seg('1', 'A'.repeat(25), 'other'))
    feed(seg('2', 'B'.repeat(25), 'other'))
    await vi.advanceTimersByTimeAsync(700)
    const prompt = llm.calls[0].messages[0].content
    expect(prompt).toContain('B'.repeat(25))
    expect(prompt).not.toContain('A'.repeat(25))
  })

  it('skips while paused and catches up once on resume', async () => {
    paused = true
    feed(seg('1', 'Erstens.', 'other'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(llm.calls).toHaveLength(0)
    paused = false
    engine.resume()
    engine.resume()
    await vi.advanceTimersByTimeAsync(200)
    expect(llm.calls).toHaveLength(1)
  })

  it('reports provider errors but not aborts', async () => {
    llm.error = new ProviderError('fake', 'auth', 'bad key', 401)
    feed(seg('1', 'Hallo.', 'other'))
    await vi.advanceTimersByTimeAsync(700)
    expect(errors.map(e => e.kind)).toEqual(['auth'])
  })

  it('stop() cancels everything', async () => {
    feed(seg('1', 'Hallo.', 'other'))
    engine.stop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(llm.calls).toHaveLength(0)
  })

  it('requestNow ignores rate limit and novelty checks', async () => {
    timing.minIntervalMs = 60_000
    feed(seg('1', 'Hallo.', 'other'))
    await vi.advanceTimersByTimeAsync(600)
    engine.requestNow('topic')
    await vi.advanceTimersByTimeAsync(10)
    expect(llm.calls).toHaveLength(2)
  })
})
