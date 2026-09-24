import { toProviderError, type ProviderError } from '../core/errors'
import { trace } from '../diag/trace'
import type { Suggestion, TranscriptSegment } from '../core/types'
import type { LlmProvider } from '../llm/types'
import { parseSuggestions } from './format'
import { buildSuggestionRequest } from './prompt'
import type { Transcript } from './transcript'

export interface EngineOptions {
  llm: LlmProvider
  transcript: Transcript
  outputLanguage: () => string
  count: () => number
  /** Wait this long after the last final utterance before asking the LLM. */
  debounceMs?: number
  /** How much conversation the LLM sees. */
  windowMs?: number
  requestTimeoutMs?: number
  /** While true (quiet mode) no requests are sent; see resume(). */
  paused?: () => boolean
  onSuggestions(suggestions: Suggestion[]): void
  onError(error: ProviderError): void
}

/**
 * Milestone-1 engine: after the other person finishes an utterance, wait for
 * a short pause, then request suggestions. A newer trigger aborts an older
 * request that is still running. Rate limiting and pause/topic heuristics
 * follow in milestone 4.
 */
export class SuggestionEngine {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight: AbortController | null = null
  private stopped = false
  /** A trigger fired while paused; resume() catches up with one request. */
  private missedWhilePaused = false

  constructor(private readonly options: EngineOptions) {}

  /** Feed every transcript update into the engine. */
  onSegment(segment: TranscriptSegment): void {
    if (this.stopped) return
    if (!segment.isFinal) {
      // Someone is still talking: postpone. A running request is kept; the
      // next final utterance replaces (aborts) it.
      if (this.debounceTimer) this.clearDebounce()
      return
    }
    if (segment.speaker === 'self') return
    this.clearDebounce()
    trace('engine', 'trigger scheduled')
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.request()
    }, this.options.debounceMs ?? 700)
  }

  /** Call when leaving quiet mode. */
  resume(): void {
    if (!this.missedWhilePaused || this.stopped) return
    this.missedWhilePaused = false
    void this.request()
  }

  stop(): void {
    this.stopped = true
    this.clearDebounce()
    this.inFlight?.abort()
    this.inFlight = null
  }

  private clearDebounce() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
  }

  private async request(): Promise<void> {
    if (this.options.paused?.()) {
      this.missedWhilePaused = true
      trace('engine', 'skipped (quiet)')
      return
    }
    const segments = this.options.transcript.recentFinal(this.options.windowMs ?? 3 * 60_000)
    if (segments.length === 0) return

    this.inFlight?.abort()
    const controller = new AbortController()
    this.inFlight = controller

    trace('engine', 'request', { segments: segments.length })
    const started = Date.now()
    const request = buildSuggestionRequest({
      segments,
      outputLanguage: this.options.outputLanguage(),
      count: this.options.count(),
      withSpeakers: segments.some(s => s.speaker !== 'unknown'),
    })

    try {
      const output = await this.options.llm.complete({
        ...request,
        signal: controller.signal,
        timeoutMs: this.options.requestTimeoutMs ?? 12_000,
      })
      if (controller.signal.aborted || this.stopped) return
      const suggestions = parseSuggestions(output)
      trace('engine', 'response', { ms: Date.now() - started, chars: output.length, suggestions: suggestions.length })
      if (suggestions.length > 0) this.options.onSuggestions(suggestions)
    } catch (err) {
      const error = toProviderError(this.options.llm.id, err)
      trace('engine', 'request failed', { kind: error.kind })
      if (error.kind !== 'aborted' && !this.stopped) this.options.onError(error)
    } finally {
      if (this.inFlight === controller) this.inFlight = null
    }
  }
}
