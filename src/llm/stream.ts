import { ProviderError, errorKindFromStatus } from '../core/errors'

/**
 * Combines the caller's AbortSignal with a timeout. Returns the combined
 * signal and a function that tells whether the timeout (not the caller) fired.
 */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; timedOut: () => boolean; clear: () => void } {
  const controller = new AbortController()
  let fired = false
  const timer = setTimeout(() => {
    fired = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => fired,
    clear: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/** Throws a ProviderError for a non-2xx response, with a short body excerpt. */
export async function ensureOk(provider: string, response: Response): Promise<void> {
  if (response.ok) return
  let detail = ''
  try {
    detail = (await response.text()).slice(0, 300)
  } catch {
    /* ignore */
  }
  throw new ProviderError(provider, errorKindFromStatus(response.status), `HTTP ${response.status} ${detail}`, response.status)
}

/**
 * Reads a Server-Sent-Events body and calls `onData` with each event's data
 * payload (multi-line data joined with \n). Stops at "[DONE]".
 */
export async function readSse(response: Response, onData: (data: string) => void): Promise<void> {
  if (!response.body) throw new Error('Response has no body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary: number
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
      const data = rawEvent
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, ''))
        .join('\n')
      if (!data) continue
      if (data === '[DONE]') return
      onData(data)
    }
  }
}
