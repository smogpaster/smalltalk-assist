import Anthropic from '@anthropic-ai/sdk'
import { ProviderError, toProviderError } from '../../core/errors'
import type { LlmProvider, LlmRequest } from '../types'

const ID = 'anthropic'
/** Fastest and cheapest current Claude model – the spec asks for a fast, cheap default. */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5'

/**
 * Claude via the official SDK. `dangerouslyAllowBrowser` is required for
 * direct calls from the WebView; the SDK then sends the
 * `anthropic-dangerous-direct-browser-access` header. The key is the user's
 * own and stays on their device (bring your own key).
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = ID
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    readonly model = ANTHROPIC_DEFAULT_MODEL,
  ) {
    // Suggestions are only useful right now: one quick retry at most.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
  }

  async complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
        { signal: request.signal, timeout: request.timeoutMs ?? 15_000 },
      )
      if (onDelta) stream.on('text', delta => onDelta(delta))
      return await stream.finalText()
    } catch (err) {
      throw mapError(err)
    }
  }

  async testConnection(): Promise<void> {
    await this.complete({ system: 'Reply with OK.', messages: [{ role: 'user', content: 'Ping' }], maxTokens: 16, timeoutMs: 20_000 })
  }

  async listModels(): Promise<string[]> {
    try {
      const ids: string[] = []
      for await (const model of this.client.models.list()) ids.push(model.id)
      return ids.sort()
    } catch (err) {
      throw mapError(err)
    }
  }
}

/** Most specific first; APIConnectionError is a subclass of APIError in the TS SDK. */
function mapError(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError(ID, 'aborted', 'Request aborted')
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError(ID, 'timeout', 'No answer in time')
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError(ID, 'network', err.message)
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(ID, 'auth', err.message, err.status)
  }
  if (err instanceof Anthropic.RateLimitError) return new ProviderError(ID, 'rate_limit', err.message, 429)
  if (err instanceof Anthropic.NotFoundError || err instanceof Anthropic.BadRequestError) {
    return new ProviderError(ID, 'bad_request', err.message, err.status)
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0
    if (status === 402) return new ProviderError(ID, 'quota', err.message, status)
    // 5xx including 529 overloaded_error
    return new ProviderError(ID, status >= 500 ? 'server' : 'unknown', err.message, status || undefined)
  }
  return toProviderError(ID, err)
}
