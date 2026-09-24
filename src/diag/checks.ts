/**
 * Keyless hardware/runtime checks for the diagnostics page. They answer the
 * open platform questions on the real device (iPhone WebView):
 * - Do outbound WebSockets work at all? (reported broken on iOS by other apps)
 * - Do fetch + CORS + the app.json whitelist work?
 * Neither check sends an API key or audio.
 */

export interface CheckResult {
  ok: boolean
  summary: string
  details: string[]
  durationMs: number
}

const SONIOX_WS = 'wss://stt-rt.soniox.com/transcribe-websocket'
const SONIOX_REST = 'https://api.soniox.com/v1/models'

/**
 * Opens a Soniox WebSocket and sends a config with a dummy key. Soniox
 * authenticates in-band, so receiving its "invalid key" error proves the
 * handshake and both directions work.
 */
export function checkWebSocket(timeoutMs = 10_000): Promise<CheckResult> {
  const started = performance.now()
  const details: string[] = []
  const elapsed = () => Math.round(performance.now() - started)

  return new Promise(resolve => {
    let settled = false
    let socket: WebSocket | null = null
    const finish = (ok: boolean, summary: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket?.close()
      } catch {
        /* already closed */
      }
      resolve({ ok, summary, details, durationMs: elapsed() })
    }
    const timer = setTimeout(() => finish(false, 'timeout – no answer'), timeoutMs)

    try {
      socket = new WebSocket(SONIOX_WS)
    } catch (err) {
      details.push(`constructor threw: ${(err as Error).message}`)
      finish(false, 'WebSocket constructor failed')
      return
    }

    socket.onopen = () => {
      details.push(`open after ${elapsed()} ms`)
      socket!.send(
        JSON.stringify({
          api_key: 'invalid-diagnostic-key',
          model: 'stt-rt-preview',
          audio_format: 'pcm_s16le',
          sample_rate: 16000,
          num_channels: 1,
        }),
      )
      details.push('config sent')
    }
    socket.onmessage = event => {
      const text = typeof event.data === 'string' ? event.data : '[binary]'
      details.push(`message after ${elapsed()} ms: ${text.slice(0, 160)}`)
      finish(true, 'WebSocket works (server answered)')
    }
    socket.onerror = () => {
      details.push(`error event after ${elapsed()} ms`)
    }
    socket.onclose = event => {
      details.push(`close code=${event.code} reason=${event.reason || '-'} clean=${event.wasClean}`)
      finish(false, event.code === 1006 ? 'handshake failed (1006)' : `closed before answer (${event.code})`)
    }
  })
}

/** Unauthenticated GET that returns 401 with CORS headers when everything works. */
export async function checkFetch(timeoutMs = 10_000): Promise<CheckResult> {
  const started = performance.now()
  const details: string[] = []
  try {
    const response = await fetch(SONIOX_REST, { signal: AbortSignal.timeout(timeoutMs) })
    details.push(`status ${response.status}`)
    const ok = response.status === 401 || response.ok
    return { ok, summary: ok ? 'HTTPS + CORS work' : `unexpected status ${response.status}`, details, durationMs: Math.round(performance.now() - started) }
  } catch (err) {
    details.push(`${(err as Error).name}: ${(err as Error).message}`)
    return { ok: false, summary: 'request blocked (network, CORS or whitelist)', details, durationMs: Math.round(performance.now() - started) }
  }
}

/**
 * Same endpoint, but with an Authorization header (dummy key): needs a CORS
 * preflight. Expected answer 401. A failure here but not in checkFetch means
 * the WebView blocks requests with custom headers.
 */
export async function checkFetchWithAuth(timeoutMs = 10_000): Promise<CheckResult> {
  const started = performance.now()
  const details: string[] = []
  try {
    const response = await fetch(SONIOX_REST, {
      headers: { Authorization: 'Bearer invalid-diagnostic-key' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    details.push(`status ${response.status}`)
    const ok = response.status === 401
    return { ok, summary: ok ? 'Requests with auth header work' : `unexpected status ${response.status}`, details, durationMs: Math.round(performance.now() - started) }
  } catch (err) {
    details.push(`${(err as Error).name}: ${(err as Error).message}`)
    return { ok: false, summary: 'request with auth header blocked', details, durationMs: Math.round(performance.now() - started) }
  }
}

/** Characters to verify on the glasses; `expected` comes from the firmware font metrics. */
export const GLYPH_SAMPLES = [
  'Äöüß „Grüße" – … é ñ',
  '● ○ ▶ ◆ ◇ ★ ■ □ ▲ ▼ ↑ → • ·',
  'ひらがな カタカナ 漢字 ー。、「」？',
  '① ♪ │ ━ ─',
  'missing: ↳ ✓ ⏸ ❓ 💬 (should vanish)',
]

export function countFrameStats(pcm: Uint8Array): { rms: number } {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const samples = Math.floor(pcm.byteLength / 2)
  let sum = 0
  for (let i = 0; i < samples; i++) {
    const v = view.getInt16(i * 2, true)
    sum += v * v
  }
  return { rms: samples ? Math.sqrt(sum / samples) / 32768 : 0 }
}
