import { ProviderError } from '../../core/errors'
import { trace } from '../../diag/trace'
import { CONVERSATION_LANGUAGES } from '../languages'
import type { SttCallbacks, SttCapabilities, SttProvider, SttSession, SttSessionOptions } from '../types'
import { closeKind, openWebSocket, providerFetch, toArrayBuffer } from '../ws'

const ID = 'gladia'
const API_URL = 'https://api.gladia.io/v2/live'
export const GLADIA_DEFAULT_MODEL = 'solaria-1'

interface GladiaMessage {
  type?: string
  data?: {
    id?: string
    is_final?: boolean
    utterance?: { text?: string; start?: number; end?: number; language?: string }
  }
}

/**
 * Gladia live STT (docs: docs.gladia.io/api-reference/v2/live/init + /websocket).
 * The init request returns a session-scoped WebSocket URL, so the key is
 * only used for that HTTPS call. Live mode has no speaker labels.
 */
export class GladiaProvider implements SttProvider {
  readonly id = ID
  readonly capabilities: SttCapabilities = {
    streaming: true,
    diarization: false,
    languages: CONVERSATION_LANGUAGES,
    autoDetect: true,
    transports: ['websocket'],
  }

  constructor(
    private readonly apiKey: string,
    private readonly model = GLADIA_DEFAULT_MODEL,
  ) {}

  async testConnection(): Promise<void> {
    await providerFetch(ID, `${API_URL}?limit=1`, { headers: { 'x-gladia-key': this.apiKey } })
  }

  async start(options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession> {
    const auto = options.language === 'auto'
    const response = await providerFetch(ID, API_URL, {
      method: 'POST',
      headers: { 'x-gladia-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encoding: 'wav/pcm',
        bit_depth: 16,
        sample_rate: options.sampleRate,
        channels: 1,
        model: this.model,
        endpointing: 0.5,
        maximum_duration_without_endpointing: 15,
        language_config: { languages: auto ? [] : [options.language], code_switching: auto },
        messages_config: { receive_partial_transcripts: true, receive_final_transcripts: true },
      }),
    })
    const session = (await response.json()) as { id?: string; url?: string }
    if (!session.url) throw new ProviderError(ID, 'unknown', 'No WebSocket URL in response')

    const socket = await openWebSocket(ID, session.url)
    let closing = false
    // Partial and final messages are not guaranteed to share an id; one
    // channel means one utterance at a time, so number them ourselves.
    let utteranceIndex = 0

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return
      let message: GladiaMessage
      try {
        message = JSON.parse(event.data) as GladiaMessage
      } catch {
        return
      }
      if (message.type !== 'transcript' || !message.data?.utterance) return
      const { utterance } = message.data
      const text = utterance.text?.trim()
      if (!text) return
      const isFinal = message.data.is_final === true
      callbacks.onResult({
        id: `${ID}-${utteranceIndex}`,
        text,
        isFinal,
        language: utterance.language,
        startMs: (utterance.start ?? 0) * 1000,
        endMs: (utterance.end ?? 0) * 1000,
      })
      if (isFinal) utteranceIndex++
    }
    socket.onclose = event => {
      if (!closing) {
        trace('stt', 'gladia closed', { code: event.code })
        callbacks.onError(new ProviderError(ID, closeKind(event.code), `Connection closed (${event.code})`))
      }
      callbacks.onClosed?.()
    }

    return {
      sendPcm(chunk) {
        if (socket.readyState === WebSocket.OPEN) socket.send(toArrayBuffer(chunk))
      },
      async close() {
        closing = true
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'stop_recording' }))
        setTimeout(() => socket.close(), 1500)
      },
    }
  }
}
