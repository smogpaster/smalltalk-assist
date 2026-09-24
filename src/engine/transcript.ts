import type { Speaker, TranscriptSegment } from '../core/types'

/**
 * In-memory transcript of the running conversation. Never persisted; `clear()`
 * is called when the session ends. Interim results replace each other by id.
 */
export class Transcript {
  private segments: TranscriptSegment[] = []

  upsert(segment: TranscriptSegment): void {
    const index = this.segments.findIndex(s => s.id === segment.id)
    if (index >= 0) this.segments[index] = segment
    else this.segments.push(segment)
  }

  /** Re-labels every segment carrying `label` (after calibration or a manual swap). */
  relabel(label: string, speaker: Speaker): void {
    this.segments = this.segments.map(s => (s.speakerLabel === label ? { ...s, speaker } : s))
  }

  all(): readonly TranscriptSegment[] {
    return this.segments
  }

  /** Final segments that ended within the last `windowMs` of the newest one. */
  recentFinal(windowMs: number): TranscriptSegment[] {
    const finals = this.segments.filter(s => s.isFinal && s.text.trim())
    if (finals.length === 0) return []
    const newest = Math.max(...finals.map(s => s.endMs))
    return finals.filter(s => s.endMs >= newest - windowMs)
  }

  clear(): void {
    this.segments = []
  }
}

/** Plain-text rendering for prompts: one line per utterance with a speaker tag. */
export function formatForPrompt(segments: readonly TranscriptSegment[], withSpeakers: boolean): string {
  return segments
    .map(s => {
      if (!withSpeakers) return s.text
      const tag = s.speaker === 'self' ? 'ME' : s.speaker === 'other' ? 'THEM' : '?'
      return `${tag}: ${s.text}`
    })
    .join('\n')
}
