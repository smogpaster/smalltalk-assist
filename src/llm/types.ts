export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  system: string
  messages: LlmMessage[]
  maxTokens: number
  temperature?: number
  /** Ask the provider for a JSON object if it supports a dedicated mode. */
  json?: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

export interface LlmProvider {
  readonly id: string
  readonly model: string
  /**
   * Streams the completion. `onDelta` receives text chunks as they arrive;
   * the promise resolves with the full text. Rejects with ProviderError.
   */
  complete(request: LlmRequest, onDelta?: (chunk: string) => void): Promise<string>
  testConnection(): Promise<void>
}
