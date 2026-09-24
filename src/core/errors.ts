/**
 * Uniform error type for every provider adapter (STT and LLM).
 * UI code maps `kind` to a translated, user-facing message; `message` is for
 * developers and must never contain API keys or conversation content.
 */
export type ProviderErrorKind =
  | 'auth' // key missing, invalid or revoked
  | 'rate_limit'
  | 'quota' // billing / credits exhausted
  | 'network' // offline, DNS, CORS, whitelist
  | 'timeout'
  | 'aborted'
  | 'bad_request' // wrong model name, invalid parameters
  | 'server'
  | 'unsupported'
  | 'unknown'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly status?: number
  readonly provider: string

  constructor(provider: string, kind: ProviderErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.provider = provider
    this.kind = kind
    this.status = status
  }

  /** Transient errors are worth retrying later; the rest need user action. */
  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server'
  }
}

export function errorKindFromStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'quota'
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate_limit'
  if (status === 400 || status === 404 || status === 422) return 'bad_request'
  if (status >= 500) return 'server'
  return 'unknown'
}

/** Normalizes anything thrown by fetch/WebSocket code into a ProviderError. */
export function toProviderError(provider: string, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ProviderError(provider, 'aborted', 'Request aborted')
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ProviderError(provider, 'timeout', 'Request timed out')
  }
  if (err instanceof TypeError) {
    // fetch() rejects with TypeError on network failure, CORS or whitelist blocks.
    return new ProviderError(provider, 'network', err.message)
  }
  return new ProviderError(provider, 'unknown', err instanceof Error ? err.message : String(err))
}
