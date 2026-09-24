import { ProviderError } from '../core/errors'
import type { LanguageCode, Suggestion } from '../core/types'
import { encodeSuggestions } from '../engine/format'
import type { LlmProvider, LlmRequest } from '../llm/types'
import { DEMO_SCRIPTS } from './scripts'

const CHUNK_SIZE = 12
/** Simulated time until the complete answer is there. */
const LATENCY_MS = 900

/**
 * Answers with the canned suggestions of the most recent scripted line that
 * appears in the prompt, delivered in small chunks like a real stream – so
 * the demo exercises the same parsing, abort and rendering paths.
 *
 * One single wait instead of a timer per chunk: while the WebView is hidden
 * the host throttles timers to ~1 s, and a chain of small delays would turn
 * a 1 s answer into 20 s.
 */
export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock'
  readonly model = 'mock-1'

  constructor(private readonly language: LanguageCode) {}

  async testConnection(): Promise<void> {}

  async complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string> {
    const prompt = request.messages.map(m => m.content).join('\n')
    const output = encodeSuggestions(this.pick(prompt))

    await delay(LATENCY_MS, request.signal)
    for (let i = 0; i < output.length; i += CHUNK_SIZE) onDelta?.(output.slice(i, i + CHUNK_SIZE))
    return output
  }

  private pick(prompt: string): Suggestion[] {
    let best: { at: number; suggestions: Suggestion[] } | null = null
    for (const line of DEMO_SCRIPTS[this.language]) {
      if (!line.suggestions) continue
      const at = prompt.lastIndexOf(line.text)
      if (at >= 0 && (!best || at > best.at)) best = { at, suggestions: line.suggestions }
    }
    return best?.suggestions ?? []
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError('mock', 'aborted', 'aborted'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new ProviderError('mock', 'aborted', 'aborted'))
      },
      { once: true },
    )
  })
}
