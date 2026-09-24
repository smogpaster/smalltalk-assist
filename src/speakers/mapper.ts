import type { Speaker } from '../core/types'

/** Frames with a known role inside an utterance needed for a confident vote. */
const MIN_VOTES = 4
/** Share of the known-role frames needed to call an utterance self/other. */
const MAJORITY = 0.6
/** Utterances needed before a diarization label is trusted on its own. */
const MIN_LABEL_EVIDENCE = 2

interface RoleMark {
  /** Audio time within the current STT stream, ms. */
  startMs: number
  endMs: number
  role: Speaker
}

/**
 * Decides who said an utterance: the wearer ("self") or someone else.
 *
 * Signals, strongest first:
 * 1. The Even app classifies every glasses-mic frame as self/other
 *    (`speakerRole`, SDK ≥ 0.0.14). An utterance's audio span is matched to
 *    those frames and decided by majority.
 * 2. The STT provider's diarization label. Each confidently classified
 *    utterance teaches which label belongs to the wearer, so utterances
 *    without enough frame votes (phone mic, short words) still map.
 * 3. Manual fixes: "that was me" for the next utterance, or swap.
 */
export class SpeakerMapper {
  private marks: RoleMark[] = []
  private labelVotes = new Map<string, { self: number; other: number }>()
  /** Fixed label → speaker (demo mode or manual calibration). */
  private fixed = new Map<string, Speaker>()
  private swapped = false
  private calibrateNext = false

  /** Demo mode knows the wearer's label up front. */
  setSelfLabel(label: string | null): void {
    this.fixed.clear()
    if (label !== null) this.fixed.set(label, 'self')
  }

  /** Forget frame marks (new STT stream: audio time restarts at 0). Label knowledge is kept. */
  resetTimeline(): void {
    this.marks = []
  }

  /** Clears everything (new session). */
  reset(): void {
    this.marks = []
    this.labelVotes.clear()
    this.fixed.clear()
    this.swapped = false
    this.calibrateNext = false
  }

  /** Records the Even app's role for a stretch of audio sent to the STT stream. */
  observe(startMs: number, endMs: number, role: Speaker): void {
    if (role === 'unknown') return
    const last = this.marks[this.marks.length - 1]
    if (last && last.role === role && startMs - last.endMs < 5) last.endMs = endMs
    else this.marks.push({ startMs, endMs, role })
    // Keep ~5 minutes of audio time.
    if (this.marks.length > 4000) this.marks.splice(0, this.marks.length - 4000)
  }

  /** The next final utterance is the wearer (calibration: "say one sentence"). */
  markNextAsSelf(): void {
    this.calibrateNext = true
  }

  /** Swap self and other for everything (manual correction). */
  swap(): void {
    this.swapped = !this.swapped
  }

  get isCalibrating(): boolean {
    return this.calibrateNext
  }

  /**
   * Classifies an utterance. `final` utterances also teach the label
   * mapping; interim ones only read it.
   */
  classify(label: string | undefined, startMs: number, endMs: number, final: boolean): Speaker {
    if (final && this.calibrateNext) {
      this.calibrateNext = false
      if (label !== undefined) {
        this.fixed.clear()
        this.fixed.set(label, 'self')
      }
      return this.apply('self')
    }

    const fixed = label !== undefined ? this.fixedFor(label) : undefined
    if (fixed) return this.apply(fixed)

    const byFrames = this.voteFrames(startMs, endMs)
    if (final && byFrames !== 'unknown' && label !== undefined) this.learn(label, byFrames)
    if (byFrames !== 'unknown') return this.apply(byFrames)
    return this.apply(label !== undefined ? this.byLabel(label) : 'unknown')
  }

  private fixedFor(label: string): Speaker | undefined {
    if (this.fixed.size === 0) return undefined
    // With a known self label, every other label is someone else.
    return this.fixed.get(label) ?? 'other'
  }

  private voteFrames(startMs: number, endMs: number): Speaker {
    let self = 0
    let other = 0
    for (const mark of this.marks) {
      const overlap = Math.min(endMs, mark.endMs) - Math.max(startMs, mark.startMs)
      if (overlap <= 0) continue
      if (mark.role === 'self') self += overlap
      else other += overlap
    }
    const total = self + other
    // ~50 ms per frame on the glasses.
    if (total < MIN_VOTES * 50) return 'unknown'
    if (self / total >= MAJORITY) return 'self'
    if (other / total >= MAJORITY) return 'other'
    return 'unknown'
  }

  private learn(label: string, speaker: Speaker): void {
    const votes = this.labelVotes.get(label) ?? { self: 0, other: 0 }
    if (speaker === 'self') votes.self++
    else if (speaker === 'other') votes.other++
    this.labelVotes.set(label, votes)
  }

  private byLabel(label: string): Speaker {
    const votes = this.labelVotes.get(label)
    if (!votes || votes.self + votes.other < MIN_LABEL_EVIDENCE) return 'unknown'
    if (votes.self > votes.other * 2) return 'self'
    if (votes.other > votes.self * 2) return 'other'
    return 'unknown'
  }

  private apply(speaker: Speaker): Speaker {
    if (!this.swapped || speaker === 'unknown') return speaker
    return speaker === 'self' ? 'other' : 'self'
  }
}
