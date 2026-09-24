import type { LanguageCode } from '../core/types'
import type { SttCallbacks, SttCapabilities, SttProvider, SttSession, SttSessionOptions } from '../stt/types'
import { DEMO_SCRIPTS, type ScriptLine } from './scripts'

/** Diarization labels the mock uses: the wearer is always "0". */
export const MOCK_SELF_LABEL = '0'
export const MOCK_OTHER_LABEL = '1'

const WORD_INTERVAL_MS = 220
const CJK_CHUNK = 3

/**
 * Replays a scripted conversation as if it came from a streaming STT
 * provider: interim results word by word, then a final result per line, with
 * diarization labels. Audio passed to `sendPcm` is ignored, so it works in
 * the simulator without a microphone and without keys.
 */
export class MockSttProvider implements SttProvider {
  readonly id = 'mock'
  readonly capabilities: SttCapabilities = {
    streaming: true,
    diarization: true,
    languages: ['de', 'en', 'ja'],
    autoDetect: false,
    transports: ['websocket'],
  }

  constructor(
    private readonly language: LanguageCode,
    private readonly speed = 1,
  ) {}

  async testConnection(): Promise<void> {}

  async start(_options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession> {
    const script = DEMO_SCRIPTS[this.language]
    let timer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    let clockMs = 0
    let lineIndex = 0
    let utterance = 0

    const schedule = (fn: () => void, ms: number) => {
      const scaled = ms / this.speed
      clockMs += ms
      timer = setTimeout(() => {
        if (!closed) fn()
      }, scaled)
    }

    const playLine = (line: ScriptLine) => {
      const id = `mock-${utterance++}`
      const pieces = splitForStreaming(line.text, this.language)
      const startMs = clockMs
      let shown = 0
      const step = () => {
        shown++
        const text = joinPieces(pieces.slice(0, shown), this.language)
        const isFinal = shown === pieces.length
        callbacks.onResult({
          id,
          text,
          isFinal,
          speakerLabel: line.speaker === 'self' ? MOCK_SELF_LABEL : MOCK_OTHER_LABEL,
          language: this.language,
          startMs,
          endMs: clockMs,
        })
        if (!isFinal) schedule(step, WORD_INTERVAL_MS)
        else schedule(next, line.pauseMs)
      }
      schedule(step, WORD_INTERVAL_MS)
    }

    const next = () => {
      const line = script[lineIndex % script.length]
      lineIndex++
      playLine(line)
    }

    schedule(next, 600)

    return {
      sendPcm() {},
      async close() {
        closed = true
        if (timer) clearTimeout(timer)
        callbacks.onClosed?.()
      },
    }
  }
}

function splitForStreaming(text: string, language: LanguageCode): string[] {
  if (language !== 'ja') return text.split(' ')
  const chars = Array.from(text)
  const pieces: string[] = []
  for (let i = 0; i < chars.length; i += CJK_CHUNK) pieces.push(chars.slice(i, i + CJK_CHUNK).join(''))
  return pieces
}

function joinPieces(pieces: string[], language: LanguageCode): string {
  return pieces.join(language === 'ja' ? '' : ' ')
}
