import { toProviderError, ProviderError } from '../../core/errors'
import { ensureOk, readSse, withTimeout } from '../stream'
import { trace } from '../../diag/trace'
import type { LlmProvider, LlmRequest } from '../types'

const ID = 'gemini'
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
/** Google's "fastest, most cost-effective" current Flash-Lite model (ai.google.dev/gemini-api/docs/models). */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite'

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  error?: { message?: string; code?: number }
}

/**
 * Gemini API, streamGenerateContent with SSE (alt=sse). Key in the
 * x-goog-api-key header (CORS allows it), never in the URL.
 */
export class GeminiProvider implements LlmProvider {
  readonly id = ID

  constructor(
    private readonly apiKey: string,
    readonly model = GEMINI_DEFAULT_MODEL,
  ) {}

  async complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string> {
    const timeout = withTimeout(request.signal, request.timeoutMs ?? 15_000)
    let text = ''
    let chunks = 0
    const started = Date.now()
    try {
      const response = await fetch(`${BASE_URL}/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            maxOutputTokens: request.maxTokens,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(request.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: timeout.signal,
      })
      // Timing points: where does a slow request hang (headers vs. stream)?
      trace('llm', 'gemini headers', { status: response.status, ms: Date.now() - started })
      await ensureOk(ID, response)
      await readSse(response, data => {
        chunks++
        const chunk = JSON.parse(data) as GeminiChunk
        if (chunk.error) throw new ProviderError(ID, 'server', chunk.error.message ?? 'Stream error', chunk.error.code)
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.thought || !part.text) continue
          text += part.text
          onDelta?.(part.text)
        }
      })
      trace('llm', 'gemini done', { ms: Date.now() - started, chunks, chars: text.length })
      return text
    } catch (err) {
      trace('llm', 'gemini failed', { ms: Date.now() - started, chunks, timedOut: timeout.timedOut() })
      if (timeout.timedOut()) throw new ProviderError(ID, 'timeout', 'No answer in time')
      throw toProviderError(ID, err)
    } finally {
      timeout.clear()
    }
  }

  async testConnection(): Promise<void> {
    await this.complete({ system: 'Reply with OK.', messages: [{ role: 'user', content: 'Ping' }], maxTokens: 16, timeoutMs: 20_000 })
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${BASE_URL}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': this.apiKey },
      signal: AbortSignal.timeout(15_000),
    }).catch(err => {
      throw toProviderError(ID, err)
    })
    await ensureOk(ID, response)
    const body = (await response.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
    return (body.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort()
  }
}
