import { ProviderError, toProviderError } from '../../core/errors'
import { ensureOk, readSse, withTimeout } from '../stream'
import type { LlmProvider, LlmRequest } from '../types'

export interface OpenAiCompatibleConfig {
  /** Provider id used in errors, e.g. "openai", "mistral", "groq". */
  id: string
  /** Base URL without trailing slash, e.g. https://api.openai.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  /** Send response_format json_object (supported by OpenAI, Mistral and most compatible hosts). */
  jsonMode?: boolean
  /** OpenAI's newer models take max_completion_tokens instead of max_tokens. */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
  /**
   * Lower bound for the token limit. Reasoning models count hidden reasoning
   * against max_completion_tokens; a tight limit would return empty text.
   * Only tokens actually generated are billed.
   */
  minMaxTokens?: number
  /** Reasoning models reject a custom temperature. */
  sendTemperature?: boolean
}

interface ChatChunk {
  choices?: { delta?: { content?: string | null } }[]
  error?: { message?: string }
}

/**
 * Chat Completions streaming (OpenAI format), used for OpenAI, Mistral and
 * the OpenAI-compatible presets. SSE chunks carry choices[0].delta.content.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string
  readonly model: string

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.id = config.id
    this.model = config.model
  }

  async complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string> {
    const timeout = withTimeout(request.signal, request.timeoutMs ?? 15_000)
    let text = ''
    try {
      const body: Record<string, unknown> = {
        model: this.model,
        stream: true,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
        [this.config.maxTokensField ?? 'max_tokens']: Math.max(request.maxTokens, this.config.minMaxTokens ?? 0),
      }
      if (request.temperature !== undefined && this.config.sendTemperature !== false) body.temperature = request.temperature
      if (request.json && this.config.jsonMode !== false) body.response_format = { type: 'json_object' }

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeout.signal,
      })
      await ensureOk(this.id, response)
      await readSse(response, data => {
        const chunk = JSON.parse(data) as ChatChunk
        if (chunk.error) throw new ProviderError(this.id, 'server', chunk.error.message ?? 'Stream error')
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          text += delta
          onDelta?.(delta)
        }
      })
      return text
    } catch (err) {
      if (timeout.timedOut()) throw new ProviderError(this.id, 'timeout', 'No answer in time')
      throw toProviderError(this.id, err)
    } finally {
      timeout.clear()
    }
  }

  /** A real, tiny request: proves key, model name and endpoint in one go. */
  async testConnection(): Promise<void> {
    await this.complete({ system: 'Reply with OK.', messages: [{ role: 'user', content: 'Ping' }], maxTokens: 16, timeoutMs: 20_000 })
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(err => {
      throw toProviderError(this.id, err)
    })
    await ensureOk(this.id, response)
    const body = (await response.json()) as { data?: { id?: string }[] }
    return (body.data ?? []).map(m => m.id ?? '').filter(Boolean).sort()
  }
}
