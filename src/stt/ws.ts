import { ProviderError, errorKindFromStatus } from '../core/errors'

/**
 * Opens a WebSocket and resolves once it is open. Browsers hide handshake
 * details (a rejected key and a network failure both surface as close code
 * 1006), so the error is reported as `network` unless the caller knows better.
 */
export function openWebSocket(provider: string, url: string, protocols?: string[], timeoutMs = 10_000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket
    try {
      socket = protocols ? new WebSocket(url, protocols) : new WebSocket(url)
    } catch (err) {
      reject(new ProviderError(provider, 'network', `WebSocket constructor failed: ${(err as Error).message}`))
      return
    }
    socket.binaryType = 'arraybuffer'
    const timer = setTimeout(() => {
      cleanup()
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      reject(new ProviderError(provider, 'timeout', 'WebSocket did not open in time'))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      socket.onopen = null
      socket.onclose = null
      socket.onerror = null
    }
    socket.onopen = () => {
      cleanup()
      resolve(socket)
    }
    socket.onclose = event => {
      cleanup()
      reject(new ProviderError(provider, closeKind(event.code), `WebSocket closed during handshake (${event.code})`))
    }
    socket.onerror = () => {
      /* followed by onclose */
    }
  })
}

/** Maps WebSocket close codes to error kinds (1008 policy = usually auth). */
export function closeKind(code: number): ProviderError['kind'] {
  if (code === 1008 || code === 4001 || code === 4003) return 'auth'
  if (code === 1011 || code === 1013) return 'server'
  return 'network'
}

/** Performs a fetch and throws ProviderError for non-2xx responses. */
export async function providerFetch(provider: string, url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'TimeoutError') throw new ProviderError(provider, 'timeout', 'Request timed out')
    if (name === 'AbortError') throw new ProviderError(provider, 'aborted', 'Request aborted')
    throw new ProviderError(provider, 'network', (err as Error).message)
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
    throw new ProviderError(provider, errorKindFromStatus(response.status), `HTTP ${response.status} ${detail}`, response.status)
  }
  return response
}

/** Copies a PCM chunk into its own ArrayBuffer (the SDK may reuse or view a larger buffer). */
export function toArrayBuffer(chunk: Uint8Array): ArrayBuffer {
  return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
}
