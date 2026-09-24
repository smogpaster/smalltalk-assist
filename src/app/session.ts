import type { AudioInput } from '../audio/input'
import { ProviderError, toProviderError } from '../core/errors'
import type { Suggestion, TranscriptSegment } from '../core/types'
import { trace } from '../diag/trace'
import { clampPage } from '../display/layout'
import { SuggestionEngine } from '../engine/engine'
import { Transcript } from '../engine/transcript'
import type { LlmProvider } from '../llm/types'
import type { Settings } from '../settings/schema'
import { SpeakerMapper } from '../speakers/mapper'
import type { SttProvider, SttResult, SttSession } from '../stt/types'

export type SessionPhase = 'idle' | 'starting' | 'recording' | 'quiet'

/** Always ask for 3; the glasses show 1–3 at a time and the rest is one swipe away. */
const SUGGESTIONS_PER_REQUEST = 3
/** Delays before reconnect attempts after the STT connection dropped. */
const RECONNECT_DELAYS_MS = [1000, 3000, 6000]

export interface SessionSnapshot {
  phase: SessionPhase
  demo: boolean
  transcript: readonly TranscriptSegment[]
  suggestions: readonly Suggestion[]
  page: number
  perPage: number
  error: ProviderError | null
  /** No LLM configured: the glasses show the latest transcript instead of suggestions. */
  transcriptOnly: boolean
  reconnecting: boolean
  /** The next finished utterance will be taken as the wearer's voice. */
  calibrating: boolean
}

export interface SessionProviders {
  stt: SttProvider
  /** null until an LLM is configured (transcript-only mode). */
  llm: LlmProvider | null
  /** Diarization label of the wearer if known up front (demo mode). */
  selfLabel?: string
  /** Whether audio must be captured (false for the scripted demo). */
  needsAudio: boolean
  /** Conversation language code or 'auto'. */
  language: string
  diarization: boolean
}

export interface SessionDeps {
  audio: AudioInput | null
  settings: () => Settings
  /** Builds providers for the current settings; throws ProviderError if not configured. */
  createProviders(settings: Settings): SessionProviders
  /** Language for suggestions when the conversation language is auto and nothing was detected yet. */
  fallbackLanguage?: () => string
}

type Listener = (snapshot: SessionSnapshot) => void

/**
 * One conversation from start to stop. All conversation data (transcript,
 * suggestions) lives only in this object and is dropped on stop().
 */
export class ConversationSession {
  private phase: SessionPhase = 'idle'
  private demo = false
  private suggestions: Suggestion[] = []
  private page = 0
  private error: ProviderError | null = null
  private readonly transcript = new Transcript()
  private readonly speakers = new SpeakerMapper()
  private providers: SessionProviders | null = null
  private stt: SttSession | null = null
  private engine: SuggestionEngine | null = null
  private listeners = new Set<Listener>()
  /** Incremented on every start/stop so late callbacks from an old run are ignored. */
  private generation = 0
  /** Incremented per STT connection so utterance ids stay unique across reconnects. */
  private connection = 0
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private detectedLanguage: string | null = null
  /** Wall-clock start of the current STT stream; result times are relative to it. */
  private sttStartedAt = 0
  private firstResultTraced = false
  /** Audio time (ms) sent on the current STT connection; aligns frames with result timestamps. */
  private audioMs = 0
  /** A connection that reported a non-retryable error (key, credit) must not be reconnected. */
  private fatalConnection = -1

  constructor(private readonly deps: SessionDeps) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      // While idle, reflect the mode the next session will use.
      demo: this.phase === 'idle' ? this.deps.settings().mode === 'demo' : this.demo,
      transcript: [...this.transcript.all()],
      suggestions: [...this.suggestions],
      page: this.page,
      perPage: this.deps.settings().suggestionsPerPage,
      error: this.error,
      transcriptOnly: this.phase !== 'idle' && this.providers !== null && this.providers.llm === null,
      reconnecting: this.reconnectTimer !== null,
      calibrating: this.speakers.isCalibrating,
    }
  }

  get isActive(): boolean {
    return this.phase !== 'idle'
  }

  /** `reason` is only used for the diagnostics trace (e.g. 'tap', 'ui'). */
  async start(reason = 'ui'): Promise<void> {
    trace('session', 'start', { reason, phase: this.phase })
    if (this.phase !== 'idle') return
    const generation = ++this.generation
    const settings = this.deps.settings()
    this.demo = settings.mode === 'demo'
    this.error = null
    this.detectedLanguage = null
    this.reconnectAttempt = 0
    this.speakers.reset()
    this.phase = 'starting'
    this.emit()

    try {
      const providers = this.deps.createProviders(settings)
      this.providers = providers
      this.speakers.setSelfLabel(providers.selfLabel ?? null)
      if (providers.llm) this.engine = this.createEngine(providers.llm, generation)

      await this.connectStt(generation)

      if (providers.needsAudio) {
        if (!this.deps.audio) throw new ProviderError('audio', 'unsupported', 'No microphone available outside the Even app')
        // Frames go to whatever STT connection is current (null while reconnecting).
        const ok = await this.deps.audio.start(settings.micSource, frame => {
          if (!this.stt) return
          this.stt.sendPcm(frame.pcm)
          // PCM s16le mono 16 kHz = 32 bytes per ms.
          const durationMs = frame.pcm.byteLength / 32
          this.speakers.observe(this.audioMs, this.audioMs + durationMs, frame.speakerRole)
          this.audioMs += durationMs
        })
        if (!ok) throw new ProviderError('audio', 'unsupported', 'Microphone could not be opened')
      }

      if (generation !== this.generation) return
      this.phase = 'recording'
      this.emit()
    } catch (err) {
      if (generation !== this.generation) return
      const error = toProviderError('session', err)
      trace('session', 'start failed', { kind: error.kind, provider: error.provider })
      await this.teardown()
      this.error = error
      this.phase = 'idle'
      this.emit()
    }
  }

  async stop(reason = 'ui'): Promise<void> {
    trace('session', 'stop', { reason, phase: this.phase })
    if (this.phase === 'idle') return
    this.generation++
    await this.teardown()
    this.phase = 'idle'
    this.error = null
    this.emit()
  }

  toggleQuiet(): void {
    trace('session', 'toggle quiet', { phase: this.phase })
    if (this.phase === 'recording') this.phase = 'quiet'
    else if (this.phase === 'quiet') {
      this.phase = 'recording'
      this.engine?.resume()
    } else return
    this.emit()
  }

  movePage(delta: number): void {
    if (this.phase !== 'recording') return
    const perPage = this.deps.settings().suggestionsPerPage
    const next = clampPage(this.page + delta, this.suggestions.length, perPage)
    if (next === this.page) return
    this.page = next
    this.emit()
  }

  /** Manual correction: everything labelled "me" becomes "other" and vice versa. */
  swapSpeakers(): void {
    this.speakers.swap()
    this.transcript.swapSpeakers()
    trace('session', 'speakers swapped')
    this.emit()
  }

  /** Calibration: the next finished utterance is the wearer's. */
  calibrateSelf(): void {
    this.speakers.markNextAsSelf()
    trace('session', 'calibration armed')
    this.emit()
  }

  /** Called when the host brought the app back; the mic may have been dropped. */
  async resume(): Promise<void> {
    if (this.isActive && this.deps.audio?.active) await this.deps.audio.rearm()
  }

  private createEngine(llm: LlmProvider, generation: number): SuggestionEngine {
    return new SuggestionEngine({
      llm,
      transcript: this.transcript,
      outputLanguage: () => this.outputLanguage(),
      count: () => SUGGESTIONS_PER_REQUEST,
      timing: () => {
        const s = this.deps.settings()
        return { pauseMs: s.pauseMs, minIntervalMs: s.minIntervalSec * 1000, maxPerMinute: s.maxPerMinute }
      },
      // Quiet mode hides suggestions; don't pay for requests nobody sees.
      paused: () => this.phase === 'quiet',
      onSuggestions: suggestions => {
        if (generation !== this.generation) return
        // Streamed updates only ever grow the list; the page resets to the
        // newest batch.
        this.suggestions = suggestions
        this.page = 0
        this.error = null
        this.emit()
      },
      onError: error => {
        if (generation !== this.generation) return
        this.error = error
        this.emit()
      },
    })
  }

  private outputLanguage(): string {
    const fixed = this.deps.settings().suggestionLanguage
    if (!this.demo && fixed !== 'same') return fixed
    const language = this.providers?.language ?? 'en'
    if (language !== 'auto') return language
    return this.detectedLanguage ?? this.deps.fallbackLanguage?.() ?? 'en'
  }

  private async connectStt(generation: number): Promise<void> {
    const providers = this.providers!
    const connection = ++this.connection
    const started = Date.now()
    const stt = await providers.stt.start(
      { language: providers.language, diarization: providers.diarization, sampleRate: 16000 },
      {
        onResult: result => {
          if (generation === this.generation && connection === this.connection) this.handleResult(result, connection)
        },
        onError: error => {
          if (generation !== this.generation || connection !== this.connection) return
          // After a key/credit error the server closes the socket; that close
          // must not trigger reconnects (which would fail the same way forever).
          if (this.fatalConnection === connection) return
          trace('session', 'stt error', { kind: error.kind, provider: error.provider })
          this.error = error
          if (error.retryable) this.scheduleReconnect(generation)
          else this.fatalConnection = connection
          this.emit()
        },
      },
    )
    if (generation !== this.generation) {
      await stt.close()
      return
    }
    this.stt = stt
    this.audioMs = 0
    this.speakers.resetTimeline()
    this.sttStartedAt = Date.now()
    this.firstResultTraced = false
    trace('session', 'stt connected', { provider: providers.stt.id, ms: Date.now() - started, connection })
  }

  private scheduleReconnect(generation: number): void {
    if (this.reconnectTimer || this.phase === 'idle') return
    this.stt = null
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt]
    if (delay === undefined) {
      trace('session', 'reconnect gave up')
      return
    }
    this.reconnectAttempt++
    trace('session', 'reconnect scheduled', { attempt: this.reconnectAttempt, ms: delay })
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (generation !== this.generation) return
      try {
        await this.connectStt(generation)
        // reconnectAttempt is reset once results arrive again (handleResult),
        // not here: a server may accept the socket and close it right away.
        this.error = null
      } catch (err) {
        const error = toProviderError('session', err)
        this.error = error
        if (error.retryable) this.scheduleReconnect(generation)
      }
      this.emit()
    }, delay)
    this.emit()
  }

  private handleResult(result: SttResult, connection: number): void {
    if (result.language) this.detectedLanguage = result.language.split('-')[0]
    this.reconnectAttempt = 0
    const segment: TranscriptSegment = {
      id: `${connection}:${result.id}`,
      text: result.text,
      isFinal: result.isFinal,
      speakerLabel: result.speakerLabel,
      speaker: this.speakers.classify(result.speakerLabel, result.startMs, result.endMs, result.isFinal),
      startMs: result.startMs,
      endMs: result.endMs,
    }
    this.transcript.upsert(segment)
    // lagMs: how long after the spoken words the result arrived (network + provider).
    const lagMs = Math.round(Date.now() - this.sttStartedAt - result.endMs)
    if (!this.firstResultTraced) {
      this.firstResultTraced = true
      trace('session', 'first stt result', { afterConnectMs: Date.now() - this.sttStartedAt, lagMs })
    }
    if (segment.isFinal) trace('session', 'utterance', { speaker: segment.speaker, chars: segment.text.length, lagMs })
    this.engine?.onSegment(segment)
    this.emit()
  }

  /** Stops everything and forgets the conversation. */
  private async teardown(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.engine?.stop()
    this.engine = null
    const stt = this.stt
    this.stt = null
    this.providers = null
    await Promise.allSettled([this.deps.audio?.stop(), stt?.close()])
    this.transcript.clear()
    this.suggestions = []
    this.page = 0
    this.detectedLanguage = null
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
