import { ProviderError, type ProviderErrorKind } from '../../core/errors'
import { trace } from '../../diag/trace'
import { UtteranceAssembler, spacedJoiner } from '../assembler'
import { CONVERSATION_LANGUAGES } from '../languages'
import type { SttCallbacks, SttCapabilities, SttProvider, SttSession, SttSessionOptions } from '../types'
import { closeKind, openWebSocket, providerFetch, toArrayBuffer } from '../ws'

const ID = 'speechmatics'
const TEMP_KEY_URL = 'https://mp.speechmatics.com/v1/api_keys?type=rt'
const WS_URL = 'wss://eu.rt.speechmatics.com/v2'
export const SPEECHMATICS_DEFAULT_MODEL = 'enhanced'

/** App language code → Speechmatics language code. */
const LANGUAGE_CODES: Record<string, string> = { zh: 'cmn' }

interface SmResult {
  type: 'word' | 'punctuation' | 'entity'
  start_time: number
  end_time: number
  alternatives?: { content: string; speaker?: string; language?: string }[]
}

interface SmMessage {
  message: string
  metadata?: { transcript?: string; start_time?: number; end_time?: number }
  results?: SmResult[]
  type?: string
  reason?: string
}

const ERROR_KINDS: Record<string, ProviderErrorKind> = {
  not_authorised: 'auth',
  not_allowed: 'auth',
  quota_exceeded: 'rate_limit',
  timelimit_exceeded: 'quota',
  invalid_language: 'bad_request',
  invalid_model: 'bad_request',
  invalid_config: 'bad_request',
  invalid_audio_type: 'bad_request',
}

/**
 * Speechmatics real-time STT (docs: docs.speechmatics.com/api-ref/realtime-transcription-websocket).
 * Browsers must use a temporary key (JWT) in the URL; we mint a 60 s key per
 * session with the user's API key (docs: get-started/authentication). The
 * `operating_point` ("standard" | "enhanced") is used as the model setting.
 */
export class SpeechmaticsProvider implements SttProvider {
  readonly id = ID
  readonly capabilities: SttCapabilities = {
    streaming: true,
    diarization: true,
    languages: CONVERSATION_LANGUAGES,
    autoDetect: false,
    transports: ['websocket'],
  }

  constructor(
    private readonly apiKey: string,
    private readonly operatingPoint = SPEECHMATICS_DEFAULT_MODEL,
  ) {}

  async testConnection(): Promise<void> {
    await this.temporaryKey()
  }

  private async temporaryKey(): Promise<string> {
    const response = await providerFetch(ID, TEMP_KEY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 60 }),
    })
    const body = (await response.json()) as { key_value?: string }
    if (!body.key_value) throw new ProviderError(ID, 'unknown', 'No temporary key in response')
    return body.key_value
  }

  async start(options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession> {
    if (options.language === 'auto') throw new ProviderError(ID, 'unsupported', 'Speechmatics needs a fixed language')
    const jwt = await this.temporaryKey()
    const socket = await openWebSocket(ID, `${WS_URL}?jwt=${encodeURIComponent(jwt)}`)
    const language = LANGUAGE_CODES[options.language] ?? options.language

    socket.send(
      JSON.stringify({
        message: 'StartRecognition',
        audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: options.sampleRate },
        transcription_config: {
          language,
          operating_point: this.operatingPoint,
          enable_partials: true,
          max_delay: 2,
          ...(options.diarization ? { diarization: 'speaker' } : {}),
          conversation_config: { end_of_utterance_silence_trigger: 0.7 },
        },
      }),
    )

    const join = spacedJoiner(options.language)
    const assembler = new UtteranceAssembler(ID, callbacks.onResult, join)
    let started = false
    let closing = false
    let seqNo = 0

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return
      let message: SmMessage
      try {
        message = JSON.parse(event.data) as SmMessage
      } catch {
        return
      }
      switch (message.message) {
        case 'RecognitionStarted':
          started = true
          return
        case 'AddPartialTranscript': {
          const speaker = message.results?.find(r => r.alternatives?.[0]?.speaker)?.alternatives?.[0]?.speaker
          assembler.interim(message.metadata?.transcript ?? '', {
            speaker,
            startMs: (message.metadata?.start_time ?? 0) * 1000,
            endMs: (message.metadata?.end_time ?? 0) * 1000,
          })
          return
        }
        case 'AddTranscript':
          for (const group of groupResults(message.results ?? [], join)) assembler.addFinal(group.text, group)
          assembler.interim('')
          return
        case 'EndOfUtterance':
          assembler.end()
          return
        case 'Error':
          trace('stt', 'speechmatics error', { type: message.type ?? null })
          callbacks.onError(new ProviderError(ID, ERROR_KINDS[message.type ?? ''] ?? 'server', message.reason ?? 'Speechmatics error'))
          return
        default:
          return
      }
    }
    socket.onclose = event => {
      assembler.end()
      if (!closing) {
        trace('stt', 'speechmatics closed', { code: event.code })
        callbacks.onError(new ProviderError(ID, closeKind(event.code), `Connection closed (${event.code})`))
      }
      callbacks.onClosed?.()
    }

    return {
      sendPcm(chunk) {
        if (!started || socket.readyState !== WebSocket.OPEN) return
        socket.send(toArrayBuffer(chunk))
        seqNo++
      },
      async close() {
        closing = true
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: seqNo }))
        setTimeout(() => socket.close(), 1500)
      },
    }
  }
}

/** Builds text per speaker run: words separated, punctuation attached. */
function groupResults(results: SmResult[], join: (a: string, b: string) => string) {
  const groups: { text: string; speaker?: string; language?: string; startMs: number; endMs: number }[] = []
  for (const result of results) {
    const alternative = result.alternatives?.[0]
    if (!alternative?.content) continue
    const last = groups[groups.length - 1]
    const speaker = alternative.speaker
    if (last && (last.speaker === speaker || result.type === 'punctuation')) {
      last.text = result.type === 'punctuation' ? last.text + alternative.content : join(last.text, alternative.content)
      last.endMs = result.end_time * 1000
    } else {
      groups.push({ text: alternative.content, speaker, language: alternative.language, startMs: result.start_time * 1000, endMs: result.end_time * 1000 })
    }
  }
  return groups
}
