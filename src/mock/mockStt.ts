import type { LanguageCode } from '../core/types'
import type { SttCallbacks, SttCapabilities, SttProvider, SttResult, SttSession, SttSessionOptions } from '../stt/types'
import { DEMO_SCRIPTS, type ScriptLine } from './scripts'

/** Diarization labels the mock uses: the wearer is always "0". */
export const MOCK_SELF_LABEL = '0'
export const MOCK_OTHER_LABEL = '1'

const WORD_INTERVAL_MS = 220
const START_DELAY_MS = 600
const CJK_CHUNK = 3
/** How often we look at the clock. Late or coarse ticks are fine (see below). */
const TICK_MS = 150

interface TimelineEvent {
  at: number
  result: SttResult
}

/**
 * Replays a scripted conversation as if it came from a streaming STT
 * provider: interim results word by word, then a final result per line, with
 * diarization labels. Audio passed to `sendPcm` is ignored, so it works in
 * the simulator without a microphone and without keys.
 *
 * Clock-driven on purpose: while the WebView is hidden (phone locked, which
 * is the normal case when wearing the glasses) the host throttles timers to
 * about one tick per second. Each tick therefore emits everything that is due
 * by the wall clock – throttling skips interim steps but never slows the
 * conversation down.
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
    private readonly now: () => number = () => Date.now(),
  ) {}

  async testConnection(): Promise<void> {}

  async start(_options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession> {
    const script = DEMO_SCRIPTS[this.language]
    const loop = buildTimeline(script, this.language)
    const startedAt = this.now()
    let cursor = 0
    let closed = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = () => {
      if (closed) return
      const elapsed = this.now() - startedAt
      const due: TimelineEvent[] = []
      // The script loops; the timeline for pass n is shifted by n * duration.
      for (;;) {
        const pass = Math.floor(cursor / loop.events.length)
        const event = loop.events[cursor % loop.events.length]
        const at = event.at + pass * loop.duration
        if (at > elapsed) break
        due.push({ at, result: { ...event.result, id: `${event.result.id}-${pass}`, startMs: event.result.startMs + pass * loop.duration, endMs: at } })
        cursor++
      }
      // Of several interim updates for the same utterance only the last matters.
      due.forEach((event, i) => {
        const next = due[i + 1]
        const superseded = !event.result.isFinal && next && next.result.id === event.result.id
        if (!superseded) callbacks.onResult(event.result)
      })
      timer = setTimeout(tick, TICK_MS)
    }
    timer = setTimeout(tick, TICK_MS)

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

/** Precomputes every interim/final result of one pass through the script. */
export function buildTimeline(script: readonly ScriptLine[], language: LanguageCode): { events: TimelineEvent[]; duration: number } {
  const events: TimelineEvent[] = []
  let clock = START_DELAY_MS
  script.forEach((line, index) => {
    const pieces = splitForStreaming(line.text, language)
    const startMs = clock
    pieces.forEach((_, i) => {
      clock += WORD_INTERVAL_MS
      events.push({
        at: clock,
        result: {
          id: `mock-${index}`,
          text: joinPieces(pieces.slice(0, i + 1), language),
          isFinal: i === pieces.length - 1,
          speakerLabel: line.speaker === 'self' ? MOCK_SELF_LABEL : MOCK_OTHER_LABEL,
          language,
          startMs,
          endMs: clock,
        },
      })
    })
    clock += line.pauseMs
  })
  return { events, duration: clock }
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
