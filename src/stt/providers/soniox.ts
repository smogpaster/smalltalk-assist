import { ProviderError, errorKindFromStatus, toProviderError } from '../../core/errors'
import { trace } from '../../diag/trace'
import { UtteranceAssembler, concat } from '../assembler'
import { CONVERSATION_LANGUAGES } from '../languages'
import type { SttCallbacks, SttCapabilities, SttProvider, SttSession, SttSessionOptions } from '../types'
import { closeKind, openWebSocket, providerFetch, toArrayBuffer } from '../ws'

const ID = 'soniox'
const WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'
const REST_URL = 'https://api.soniox.com/v1'
/** Endpoint-detection marker token (docs: real-time transcription, endpoint detection). */
const END_TOKEN = '<end>'
export const SONIOX_DEFAULT_MODEL = 'stt-rt-v5'

interface SonioxToken {
  text: string
  start_ms?: number
  end_ms?: number
  is_final?: boolean
  speaker?: string
  language?: string
}

interface SonioxMessage {
  tokens?: SonioxToken[]
  finished?: boolean
  error_code?: number
  error_type?: string
  error_message?: string
}

/**
 * Soniox real-time STT (docs: soniox.com/docs/api-reference/stt/websocket-api).
 * Auth happens in-band in the first JSON message, so the key goes only to
 * Soniox over the encrypted socket.
 */
export class SonioxProvider implements SttProvider {
  readonly id = ID
  readonly capabilities: SttCapabilities = {
    streaming: true,
    diarization: true,
    languages: CONVERSATION_LANGUAGES,
    autoDetect: true,
    transports: ['websocket'],
  }

  constructor(
    private readonly apiKey: string,
    private readonly model = SONIOX_DEFAULT_MODEL,
  ) {}

  async testConnection(): Promise<void> {
    await providerFetch(ID, `${REST_URL}/models`, { headers: { Authorization: `Bearer ${this.apiKey}` } })
  }

  async start(options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession> {
    const socket = await openWebSocket(ID, WS_URL)
    const auto = options.language === 'auto'
    socket.send(
      JSON.stringify({
        api_key: this.apiKey,
        model: this.model,
        audio_format: 'pcm_s16le',
        sample_rate: options.sampleRate,
        num_channels: 1,
        ...(auto ? { enable_language_identification: true } : { language_hints: [options.language] }),
        enable_speaker_diarization: options.diarization,
        enable_endpoint_detection: true,
        // Default is 2000 ms; for live suggestions a sentence should close sooner.
        max_endpoint_delay_ms: 800,
      }),
    )

    const assembler = new UtteranceAssembler(ID, callbacks.onResult, concat)
    let closing = false

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return
      let message: SonioxMessage
      try {
        message = JSON.parse(event.data) as SonioxMessage
      } catch {
        return
      }
      if (message.error_code) {
        trace('stt', 'soniox error', { code: message.error_code, type: message.error_type ?? null })
        callbacks.onError(new ProviderError(ID, errorKindFromStatus(message.error_code), message.error_message ?? 'Soniox error', message.error_code))
        return
      }
      let tail = ''
      let tailMeta: { speaker?: string; startMs?: number; endMs?: number } = {}
      for (const token of message.tokens ?? []) {
        if (token.text === END_TOKEN) {
          if (token.is_final) assembler.end()
          continue
        }
        const meta = { speaker: token.speaker, language: token.language, startMs: token.start_ms ?? 0, endMs: token.end_ms ?? 0 }
        if (token.is_final) assembler.addFinal(token.text, meta)
        else {
          tail += token.text
          tailMeta = { speaker: tailMeta.speaker ?? token.speaker, startMs: tailMeta.startMs ?? token.start_ms, endMs: token.end_ms }
        }
      }
      assembler.interim(tail, tailMeta)
      if (message.finished) assembler.end()
    }
    socket.onclose = event => {
      assembler.end()
      if (!closing) {
        trace('stt', 'soniox closed', { code: event.code })
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
        try {
          // An empty frame asks Soniox to finish and close.
          if (socket.readyState === WebSocket.OPEN) socket.send(new ArrayBuffer(0))
          setTimeout(() => socket.close(), 1500)
        } catch (err) {
          throw toProviderError(ID, err)
        }
      },
    }
  }
}
