/** Who said something, from the wearer's point of view. */
export type Speaker = 'self' | 'other' | 'unknown'

/** A piece of transcript as the app sees it after speaker mapping. */
export interface TranscriptSegment {
  /** Stable per utterance; interim updates reuse the id of the utterance they refine. */
  id: string
  text: string
  isFinal: boolean
  speaker: Speaker
  /** Raw diarization label from the STT provider, if any ("0", "A", "S1", …). */
  speakerLabel?: string
  /** Milliseconds since session start. */
  startMs: number
  endMs: number
}

/**
 * The app suggests topics, never sentences to read out: "hook" is a regular
 * topic keyword, the others come from extras and menu requests.
 */
export type SuggestionKind = 'hook' | 'topic' | 'exit' | 'recall' | 'term' | 'hint'

export interface Suggestion {
  kind: SuggestionKind
  text: string
}

export type LanguageCode = 'de' | 'en' | 'ja'
