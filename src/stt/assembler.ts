import type { SttResult } from './types'

export type Joiner = (left: string, right: string) => string

/** Tokens that already carry their own spacing (Soniox). */
export const concat: Joiner = (left, right) => left + right

/** Word/segment pieces: space-separated, except CJK and punctuation. */
export function spacedJoiner(language: string): Joiner {
  // Japanese and Chinese are written without spaces; Korean uses them.
  const cjk = language === 'ja' || language === 'zh'
  return (left, right) => {
    if (!left) return right
    if (!right) return left
    if (cjk || /^[.,!?;:。、！？）」』]/.test(right)) return left.trimEnd() + right
    return `${left.trimEnd()} ${right.trimStart()}`
  }
}

/**
 * Turns a provider's stream of final pieces and interim tails into utterance
 * results: one stable id per utterance, interim updates while it grows, one
 * final result when the provider signals the end (or the speaker changes).
 */
export class UtteranceAssembler {
  private index = 0
  private finalText = ''
  private speaker: string | undefined
  private language: string | undefined
  private startMs: number | null = null
  private endMs = 0

  constructor(
    private readonly prefix: string,
    private readonly emit: (result: SttResult) => void,
    private readonly join: Joiner,
  ) {}

  /** A piece the provider will not revise any more. */
  addFinal(text: string, meta: { speaker?: string; language?: string; startMs: number; endMs: number }): void {
    if (!text) return
    if (this.finalText.trim() && meta.speaker !== undefined && this.speaker !== undefined && meta.speaker !== this.speaker) {
      this.end()
    }
    this.finalText = this.join(this.finalText, text)
    this.speaker = meta.speaker ?? this.speaker
    this.language = meta.language ?? this.language
    this.startMs ??= meta.startMs
    this.endMs = Math.max(this.endMs, meta.endMs)
  }

  /** The not-yet-final tail; replaces the previous tail. Emits an interim result. */
  interim(tail: string, meta: { speaker?: string; startMs?: number; endMs?: number } = {}): void {
    const text = this.join(this.finalText, tail).trim()
    if (!text) return
    this.emit({
      id: this.id(),
      text,
      isFinal: false,
      speakerLabel: this.speaker ?? meta.speaker,
      language: this.language,
      startMs: this.startMs ?? meta.startMs ?? 0,
      endMs: Math.max(this.endMs, meta.endMs ?? 0),
    })
  }

  /** Emits the collected final text as one finished utterance. */
  end(): void {
    const text = this.finalText.trim()
    if (text) {
      this.emit({
        id: this.id(),
        text,
        isFinal: true,
        speakerLabel: this.speaker,
        language: this.language,
        startMs: this.startMs ?? 0,
        endMs: this.endMs,
      })
      this.index++
    }
    this.finalText = ''
    this.speaker = undefined
    this.startMs = null
  }

  get hasPending(): boolean {
    return this.finalText.trim().length > 0
  }

  private id(): string {
    return `${this.prefix}-${this.index}`
  }
}
