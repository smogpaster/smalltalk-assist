import type { AudioInput } from '../audio/input'
import { ProviderError, toProviderError } from '../core/errors'
import type { Suggestion, TranscriptSegment } from '../core/types'
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

export interface SessionSnapshot {
  phase: SessionPhase
  demo: boolean
  transcript: readonly TranscriptSegment[]
  suggestions: readonly Suggestion[]
  page: number
  perPage: number
  error: ProviderError | null
}

export interface SessionProviders {
  stt: SttProvider
  llm: LlmProvider
  /** Diarization label of the wearer if known up front (demo mode). */
  selfLabel?: string
  /** Whether audio must be captured (false for the scripted demo). */
  needsAudio: boolean
}

export interface SessionDeps {
  audio: AudioInput | null
  settings: () => Settings
  /** Builds providers for the current settings; throws ProviderError if not configured. */
  createProviders(settings: Settings): SessionProviders
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
  private stt: SttSession | null = null
  private engine: SuggestionEngine | null = null
  private listeners = new Set<Listener>()
  /** Incremented on every start/stop so late callbacks from an old run are ignored. */
  private generation = 0

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
    }
  }

  get isActive(): boolean {
    return this.phase !== 'idle'
  }

  async start(): Promise<void> {
    if (this.phase !== 'idle') return
    const generation = ++this.generation
    const settings = this.deps.settings()
    this.demo = settings.mode === 'demo'
    this.error = null
    this.phase = 'starting'
    this.emit()

    try {
      const providers = this.deps.createProviders(settings)
      this.speakers.setSelfLabel(providers.selfLabel ?? null)
      this.engine = new SuggestionEngine({
        llm: providers.llm,
        transcript: this.transcript,
        // Conversation language settings arrive with the STT adapters (M3).
        outputLanguage: () => this.deps.settings().demoLanguage,
        count: () => SUGGESTIONS_PER_REQUEST,
        onSuggestions: suggestions => {
          if (generation !== this.generation) return
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

      this.stt = await providers.stt.start(
        { language: settings.demoLanguage, diarization: true, sampleRate: 16000 },
        {
          onResult: result => {
            if (generation === this.generation) this.handleResult(result)
          },
          onError: error => {
            if (generation !== this.generation) return
            this.error = error
            this.emit()
          },
        },
      )

      if (providers.needsAudio) {
        if (!this.deps.audio) throw new ProviderError('audio', 'unsupported', 'No microphone available outside the Even app')
        const stt = this.stt
        const ok = await this.deps.audio.start(settings.micSource, frame => stt.sendPcm(frame.pcm))
        if (!ok) throw new ProviderError('audio', 'unsupported', 'Microphone could not be opened')
      }

      if (generation !== this.generation) return
      this.phase = 'recording'
      this.emit()
    } catch (err) {
      if (generation !== this.generation) return
      const error = toProviderError('session', err)
      await this.teardown()
      this.error = error
      this.phase = 'idle'
      this.emit()
    }
  }

  async stop(): Promise<void> {
    if (this.phase === 'idle') return
    this.generation++
    await this.teardown()
    this.phase = 'idle'
    this.error = null
    this.emit()
  }

  toggleQuiet(): void {
    if (this.phase === 'recording') this.phase = 'quiet'
    else if (this.phase === 'quiet') this.phase = 'recording'
    else return
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

  /** Called when the host brought the app back; the mic may have been dropped. */
  async resume(): Promise<void> {
    if (this.isActive && this.deps.audio?.active) await this.deps.audio.rearm()
  }

  private handleResult(result: SttResult): void {
    const segment: TranscriptSegment = {
      id: result.id,
      text: result.text,
      isFinal: result.isFinal,
      speakerLabel: result.speakerLabel,
      speaker: this.speakers.map(result.speakerLabel),
      startMs: result.startMs,
      endMs: result.endMs,
    }
    this.transcript.upsert(segment)
    if (this.phase === 'recording') this.engine?.onSegment(segment)
    this.emit()
  }

  /** Stops everything and forgets the conversation. */
  private async teardown(): Promise<void> {
    this.engine?.stop()
    this.engine = null
    const stt = this.stt
    this.stt = null
    await Promise.allSettled([this.deps.audio?.stop(), stt?.close()])
    this.transcript.clear()
    this.suggestions = []
    this.page = 0
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
