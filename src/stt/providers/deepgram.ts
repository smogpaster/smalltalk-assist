import { ProviderError } from '../../core/errors'
import { trace } from '../../diag/trace'
import { UtteranceAssembler, spacedJoiner } from '../assembler'
import type { SttCallbacks, SttCapabilities, SttProvider, SttSession, SttSessionOptions } from '../types'
import { closeKind, openWebSocket, providerFetch, toArrayBuffer } from '../ws'
import { silentWav } from '../wav'

const ID = 'deepgram'
const WS_URL = 'wss://api.deepgram.com/v1/listen'
const REST_URL = 'https://api.deepgram.com/v1/listen'
export const DEEPGRAM_DEFAULT_MODEL = 'nova-3'
const KEEPALIVE_MS = 5000

interface DeepgramWord {
  word: string
  punctuated_word?: string
  start: number
  end: number
  speaker?: number
}

interface DeepgramMessage {
  type?: string
  is_final?: boolean
  speech_final?: boolean
  start?: number
  duration?: number
  channel?: { alternatives?: { transcript?: string; words?: DeepgramWord[]; languages?: string[] }[] }
}

/**
 * Deepgram live STT (docs: developers.deepgram.com/reference/speech-to-text/listen-streaming).
 * Browser auth: Sec-WebSocket-Protocol ["token", key].
 */
export class DeepgramProvider implements SttProvider {
  readonly id = ID
  readonly capabilities: SttCapabilities = {
    streaming: true,
    diarization: true,
    // nova-3 languages (docs: models-languages-overview); 'auto' = "multi".
    languages: ['de', 'en', 'ja', 'fr', 'es', 'it', 'nl', 'pt'],
    autoDetect: true,
    transports: ['websocket'],
  }

  constructor(
    private readonly apiKey: string,
    private readonly model = DEEPGRAM_DEFAULT_MODEL,
  ) {}

  /** Transcribes 0.5 s of silence: proves key + CORS for a negligible cost. */
  async testConnection(): Promise<void> {
    await providerFetch(ID, `${REST_URL}?model=${encodeURIComponent(this.model)}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': 'audio/wav' },
      body: new Blob([silentWav(16000, 0.5)], { type: 'audio/wav' }),
    })
  }

  async start(options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession> {
    const params = new URLSearchParams({
      model: this.model,
      language: options.language === 'auto' ? 'multi' : options.language,
      encoding: 'linear16',
      sample_rate: String(options.sampleRate),
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
    })
    if (options.diarization) params.set('diarize_model', 'latest')

    let socket: WebSocket
    try {
      socket = await openWebSocket(ID, `${WS_URL}?${params}`, ['token', this.apiKey])
    } catch (err) {
      // The browser hides the handshake status: a wrong key looks like a network error.
      if (err instanceof ProviderError && err.kind === 'network') {
        throw new ProviderError(ID, 'network', 'Could not connect (network, or the key was rejected – use "Test connection")')
      }
      throw err
    }

    const language = options.language === 'auto' ? 'multi' : options.language
    const join = spacedJoiner(language)
    const assembler = new UtteranceAssembler(ID, callbacks.onResult, join)
    let closing = false
    let lastAudioAt = Date.now()
    const keepalive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN && Date.now() - lastAudioAt > KEEPALIVE_MS - 1000) {
        socket.send(JSON.stringify({ type: 'KeepAlive' }))
      }
    }, KEEPALIVE_MS)

    socket.onmessage = event => {
      if (typeof event.data !== 'string') return
      let message: DeepgramMessage
      try {
        message = JSON.parse(event.data) as DeepgramMessage
      } catch {
        return
      }
      if (message.type === 'UtteranceEnd') {
        assembler.end()
        return
      }
      if (message.type !== 'Results') return
      const alternative = message.channel?.alternatives?.[0]
      const transcript = alternative?.transcript ?? ''
      const words = alternative?.words ?? []
      const segmentStart = (message.start ?? 0) * 1000
      const segmentEnd = segmentStart + (message.duration ?? 0) * 1000

      if (message.is_final) {
        if (options.diarization && words.some(w => w.speaker !== undefined)) {
          // Split the segment at speaker changes.
          for (const group of groupBySpeaker(words)) {
            assembler.addFinal(group.words.map(w => w.punctuated_word ?? w.word).reduce(join, ''), {
              speaker: String(group.speaker),
              startMs: group.words[0].start * 1000,
              endMs: group.words[group.words.length - 1].end * 1000,
            })
          }
        } else if (transcript) {
          assembler.addFinal(transcript, { startMs: segmentStart, endMs: segmentEnd })
        }
        assembler.interim('')
        if (message.speech_final) assembler.end()
      } else {
        const speaker = words.find(w => w.speaker !== undefined)?.speaker
        assembler.interim(transcript, { speaker: speaker === undefined ? undefined : String(speaker), startMs: segmentStart, endMs: segmentEnd })
      }
    }
    socket.onclose = event => {
      clearInterval(keepalive)
      assembler.end()
      if (!closing) {
        trace('stt', 'deepgram closed', { code: event.code })
        callbacks.onError(new ProviderError(ID, closeKind(event.code), `Connection closed (${event.code})`))
      }
      callbacks.onClosed?.()
    }

    return {
      sendPcm(chunk) {
        if (socket.readyState !== WebSocket.OPEN) return
        socket.send(toArrayBuffer(chunk))
        lastAudioAt = Date.now()
      },
      async close() {
        closing = true
        clearInterval(keepalive)
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'CloseStream' }))
        setTimeout(() => socket.close(), 1500)
      },
    }
  }
}

function groupBySpeaker(words: DeepgramWord[]): { speaker: number | undefined; words: DeepgramWord[] }[] {
  const groups: { speaker: number | undefined; words: DeepgramWord[] }[] = []
  for (const word of words) {
    const last = groups[groups.length - 1]
    if (last && last.speaker === word.speaker) last.words.push(word)
    else groups.push({ speaker: word.speaker, words: [word] })
  }
  return groups
}
