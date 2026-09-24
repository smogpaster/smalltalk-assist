import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../src/core/errors'
import type { Suggestion, TranscriptSegment } from '../src/core/types'
import { SuggestionEngine } from '../src/engine/engine'
import { Transcript } from '../src/engine/transcript'
import type { LlmProvider, LlmRequest } from '../src/llm/types'

function seg(id: string, text: string, speaker: TranscriptSegment['speaker'], isFinal = true, endMs = 0): TranscriptSegment {
  return { id, text, speaker, isFinal, startMs: endMs, endMs }
}

class FakeLlm implements LlmProvider {
  readonly id = 'fake'
  readonly model = 'fake'
  calls: LlmRequest[] = []
  response = '{"s":[{"k":"q","t":"Und du?"}]}'
  delayMs = 100
  error: ProviderError | null = null

  async testConnection() {}

  complete(request: LlmRequest): Promise<string> {
    this.calls.push(request)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => (this.error ? reject(this.error) : resolve(this.response)), this.delayMs)
      request.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new ProviderError('fake', 'aborted', 'aborted'))
      })
    })
  }
}

describe('SuggestionEngine (milestone 1)', () => {
  let llm: FakeLlm
  let transcript: Transcript
  let results: Suggestion[][]
  let errors: ProviderError[]
  let engine: SuggestionEngine

  beforeEach(() => {
    vi.useFakeTimers()
    llm = new FakeLlm()
    transcript = new Transcript()
    results = []
    errors = []
    engine = new SuggestionEngine({
      llm,
      transcript,
      outputLanguage: () => 'de',
      count: () => 3,
      debounceMs: 500,
      onSuggestions: s => results.push(s),
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

  it('asks the LLM after the other person finished and a pause passed', async () => {
    feed(seg('1', 'Ich war im Urlaub.', 'other'))
    await vi.advanceTimersByTimeAsync(499)
    expect(llm.calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0].messages[0].content).toContain('THEM: Ich war im Urlaub.')
    await vi.advanceTimersByTimeAsync(100)
    expect(results).toEqual([[{ kind: 'question', text: 'Und du?' }]])
  })

  it('does not trigger on my own utterances', async () => {
    feed(seg('1', 'Ich erzähle was.', 'self'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(llm.calls).toHaveLength(0)
  })

  it('postpones while someone keeps talking', async () => {
    feed(seg('1', 'Erster Satz.', 'other'))
    await vi.advanceTimersByTimeAsync(300)
    feed(seg('2', 'und dann', 'other', false))
    await vi.advanceTimersByTimeAsync(1000)
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
    expect(results).toHaveLength(1)
    expect(errors).toHaveLength(0)
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
})
