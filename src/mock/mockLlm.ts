import { ProviderError } from '../core/errors'
import type { LanguageCode, Suggestion } from '../core/types'
import { encodeSuggestions } from '../engine/format'
import type { LlmProvider, LlmRequest } from '../llm/types'
import { DEMO_SCRIPTS } from './scripts'

const CHUNK_SIZE = 12
const CHUNK_DELAY_MS = 40
const FIRST_TOKEN_MS = 350

/**
 * Answers with the canned suggestions of the most recent scripted line that
 * appears in the prompt, streamed in small chunks like a real provider – so
 * the demo exercises the same parsing, abort and rendering paths.
 */
export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock'
  readonly model = 'mock-1'

  constructor(private readonly language: LanguageCode) {}

  async testConnection(): Promise<void> {}

  async complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string> {
    const prompt = request.messages.map(m => m.content).join('\n')
    const output = encodeSuggestions(this.pick(prompt))

    await delay(FIRST_TOKEN_MS, request.signal)
    let emitted = ''
    for (let i = 0; i < output.length; i += CHUNK_SIZE) {
      const chunk = output.slice(i, i + CHUNK_SIZE)
      emitted += chunk
      onDelta?.(chunk)
      await delay(CHUNK_DELAY_MS, request.signal)
    }
    return emitted
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
