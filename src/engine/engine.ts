import { toProviderError, type ProviderError } from '../core/errors'
import type { Suggestion, TranscriptSegment } from '../core/types'
import { trace } from '../diag/trace'
import type { LlmProvider } from '../llm/types'
import { parseNames, parsePartialSuggestions, parseSuggestions, type NameNote } from './format'
import { buildSpecialRequest, buildSuggestionRequest, type PromptContext, type PromptFeatures, type SpecialKind } from './prompt'
import { RateLimiter } from './rateLimit'
import type { Transcript } from './transcript'

export interface EngineTiming {
  /** Pause after the other person finished a sentence before asking the LLM. */
  pauseMs: number
  /** Longer silence after my own sentence that also triggers fresh ideas. */
  silenceMs: number
  minIntervalMs: number
  maxPerMinute: number
  /** How much conversation the LLM sees. */
  windowMs: number
  /** Hard cap on transcript characters per request (cost bound). */
  maxChars: number
  /** Minimum new final text since the last request; avoids repeat requests. */
  minNewChars: number
}

export const DEFAULT_TIMING: EngineTiming = {
  pauseMs: 300,
  silenceMs: 4000,
  minIntervalMs: 6000,
  maxPerMinute: 6,
  windowMs: 3 * 60_000,
  maxChars: 4000,
  minNewChars: 12,
}

export interface EngineOptions {
  llm: LlmProvider
  transcript: Transcript
  outputLanguage: () => string
  count: () => number
  timing?: () => Partial<EngineTiming>
  /** Profile / other-person context (milestone 5). */
  context?: () => PromptContext | undefined
  /** Extras that ride along with every request (names, recall, terms). */
  features?: () => PromptFeatures
  /** Silence (ms) after which conversation openers are requested; null = off. */
  lullMs?: () => number | null
  onNames?(names: NameNote[]): void
  requestTimeoutMs?: number
  /** While true (quiet mode) no requests are sent; see resume(). */
  paused?: () => boolean
  now?: () => number
  /** `partial` = streamed and still growing; a final call follows. */
  onSuggestions(suggestions: Suggestion[], partial: boolean): void
  onError(error: ProviderError): void
}

/**
 * Decides when to ask the LLM for suggestions and runs the requests.
 *
 * Triggers: the other person finished a sentence (short pause), or a longer
 * silence after my own sentence. Someone speaking again postpones the
 * trigger. A newer trigger aborts an older request still running. Requests
 * are rate limited; a blocked trigger is kept and fired when allowed.
 */
export class SuggestionEngine {
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: AbortController | null = null
  private stopped = false
  /** A trigger fired while paused; resume() catches up with one request. */
  private missedWhilePaused = false
  /** Final transcript characters already covered by a request. */
  private coveredChars = 0
  private lullTimer: ReturnType<typeof setTimeout> | null = null
  private readonly limiter: RateLimiter
  private readonly now: () => number

  constructor(private readonly options: EngineOptions) {
    this.now = options.now ?? (() => Date.now())
    this.limiter = new RateLimiter(() => this.timing())
  }

  /** Feed every transcript update into the engine. */
  onSegment(segment: TranscriptSegment): void {
    if (this.stopped) return
    this.armLull()
    if (!segment.isFinal) {
      // Someone is talking: postpone. A running request is kept; the next
      // trigger replaces (aborts) it.
      this.clearTimer()
      return
    }
    const timing = this.timing()
    if (segment.speaker === 'self') {
      this.schedule(timing.silenceMs, 'silence')
      return
    }
    // A question from the other person is the moment the wearer needs help
    // most: it bypasses the novelty threshold ("Und du?" is short) and the
    // rate limit (earlier suggestions during the turn may have used it up).
    if (isQuestion(segment.text)) this.schedule(timing.pauseMs, 'question', true)
    else this.schedule(timing.pauseMs, 'turn-end')
  }

  /** Call when leaving quiet mode. */
  resume(): void {
    if (!this.missedWhilePaused || this.stopped) return
    this.missedWhilePaused = false
    void this.fire('resume')
  }

  /** Forces a request now (e.g. the "change topic" gesture, milestone 7). */
  requestNow(reason: string): void {
    this.clearTimer()
    void this.fire(reason, true)
  }

  /** On-demand request (topic change, exit line, recap). Ignores rate limits. */
  requestSpecial(kind: SpecialKind): void {
    if (this.stopped) return
    this.clearTimer()
    const timing = this.timing()
    const segments = trimToChars(this.options.transcript.recentFinal(timing.windowMs), timing.maxChars)
    const request = buildSpecialRequest(kind, {
      segments,
      outputLanguage: this.options.outputLanguage(),
      count: this.options.count(),
      withSpeakers: segments.some(s => s.speaker !== 'unknown'),
      context: this.options.context?.(),
    })
    this.limiter.record(this.now())
    void this.run(request, kind, false)
  }

  stop(): void {
    this.stopped = true
    this.clearTimer()
    if (this.lullTimer) clearTimeout(this.lullTimer)
    this.lullTimer = null
    this.inFlight?.abort()
    this.inFlight = null
  }

  private timing(): EngineTiming {
    return { ...DEFAULT_TIMING, ...this.options.timing?.() }
  }

  private schedule(delayMs: number, reason: string, force = false): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.fire(reason, force)
    }, delayMs)
  }

  /** (Re)starts the silence watch; fires once per silence, only after something was said. */
  private armLull(): void {
    if (this.lullTimer) clearTimeout(this.lullTimer)
    this.lullTimer = null
    const lullMs = this.options.lullMs?.()
    if (!lullMs) return
    this.lullTimer = setTimeout(() => {
      this.lullTimer = null
      if (this.stopped || this.options.paused?.()) return
      if (this.options.transcript.recentFinal(this.timing().windowMs).length === 0) return
      trace('engine', 'lull detected', { ms: lullMs })
      this.requestSpecial('lull')
    }, lullMs)
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async fire(reason: string, force = false): Promise<void> {
    if (this.stopped) return
    if (this.options.paused?.()) {
      this.missedWhilePaused = true
      trace('engine', 'skipped (quiet)', { reason })
      return
    }
    const timing = this.timing()
    const finals = this.options.transcript.recentFinal(timing.windowMs)
    if (finals.length === 0) return
    const totalChars = this.options.transcript.all().reduce((n, s) => n + (s.isFinal ? s.text.length : 0), 0)
    if (!force && totalChars - this.coveredChars < timing.minNewChars) {
      trace('engine', 'skipped (nothing new)', { reason })
      return
    }
    const now = this.now()
    const allowedAt = this.limiter.nextAllowedAt(now)
    if (!force && allowedAt > now) {
      trace('engine', 'rate limited', { reason, waitMs: allowedAt - now })
      this.schedule(allowedAt - now, `${reason}+delayed`)
      return
    }
    this.limiter.record(now)
    this.coveredChars = totalChars
    await this.request(finals, timing, reason)
  }

  private async request(finals: TranscriptSegment[], timing: EngineTiming, reason: string): Promise<void> {
    const segments = trimToChars(finals, timing.maxChars)
    const features = this.options.features?.()
    const request = buildSuggestionRequest({
      segments,
      outputLanguage: this.options.outputLanguage(),
      count: this.options.count(),
      withSpeakers: segments.some(s => s.speaker !== 'unknown'),
      context: this.options.context?.(),
      features,
    })
    await this.run(request, reason, features?.names === true)
  }

  private async run(request: ReturnType<typeof buildSuggestionRequest>, reason: string, wantsNames: boolean): Promise<void> {
    this.inFlight?.abort()
    const controller = new AbortController()
    this.inFlight = controller
    trace('engine', 'request', { reason, provider: this.options.llm.id })
    const started = this.now()
    let streamed = ''
    let shown = 0
    let firstAt: number | null = null

    try {
      const output = await this.options.llm.complete(
        { ...request, signal: controller.signal, timeoutMs: this.options.requestTimeoutMs ?? 15_000 },
        chunk => {
          if (controller.signal.aborted) return
          streamed += chunk
          const partial = parsePartialSuggestions(streamed)
          if (partial.length > shown) {
            shown = partial.length
            firstAt ??= this.now() - started
            this.options.onSuggestions(partial, true)
          }
        },
      )
      if (controller.signal.aborted || this.stopped) return
      const suggestions = parseSuggestions(output)
      trace('engine', 'response', { ms: this.now() - started, firstMs: firstAt, chars: output.length, suggestions: suggestions.length })
      if (suggestions.length > 0) this.options.onSuggestions(suggestions, false)
      else trace('engine', 'unparseable answer', { chars: output.length })
      if (wantsNames) {
        const names = parseNames(output)
        if (names.length) this.options.onNames?.(names)
      }
    } catch (err) {
      const error = toProviderError(this.options.llm.id, err)
      trace('engine', 'request failed', { kind: error.kind, status: error.status ?? null })
      if (error.kind !== 'aborted' && !this.stopped) this.options.onError(error)
    } finally {
      if (this.inFlight === controller) this.inFlight = null
    }
  }
}

/** Ends with a question mark (Latin or full-width) or Japanese question particle. */
export function isQuestion(text: string): boolean {
  const trimmed = text.trim()
  return /[?？]["'”」』)）]*$/.test(trimmed) || /か[。.]?$/.test(trimmed)
}

/** Keeps the newest segments whose text fits into `maxChars`. */
function trimToChars(segments: TranscriptSegment[], maxChars: number): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  let total = 0
  for (let i = segments.length - 1; i >= 0; i--) {
    total += segments[i].text.length
    if (total > maxChars && out.length > 0) break
    out.unshift(segments[i])
  }
  return out
}
