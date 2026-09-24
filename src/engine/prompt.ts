import type { TranscriptSegment } from '../core/types'
import type { LlmRequest } from '../llm/types'
import { formatForPrompt } from './transcript'

const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  en: 'English',
  ja: 'Japanese',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
  zh: 'Chinese',
  ko: 'Korean',
}

/** Profile and conversation-partner context (filled in by milestone 5). */
export interface PromptContext {
  /** Free-text lines about the wearer, the other person, tone, goal, topics to avoid. */
  lines: string[]
}

export interface PromptInput {
  segments: readonly TranscriptSegment[]
  /** Language code for the suggestions. */
  outputLanguage: string
  count: number
  withSpeakers: boolean
  context?: PromptContext
}

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code
}

/**
 * Builds the suggestion request. Kept short on purpose: every token adds
 * latency and cost. The system part is stable (cache friendly); the
 * conversation goes into the user message.
 */
export function buildSuggestionRequest(input: PromptInput): Pick<LlmRequest, 'system' | 'messages' | 'maxTokens' | 'json' | 'temperature'> {
  const language = languageName(input.outputLanguage)
  const system = [
    'You are a discreet small-talk helper. The wearer of smart glasses reads your suggestions at a glance during a live conversation.',
    `Suggest ${input.count} things the wearer could say next, written in ${language}.`,
    'Rules: at most 12 words each; natural spoken language; concrete and tied to what was just said; no emoji; no quotes around the text; never repeat what was already said.',
    'Mix kinds: "q" = a question to ask the other person, "r" = a reply idea or short anecdote hook.',
    'Answer ONLY with compact JSON: {"s":[{"k":"q","t":"..."},{"k":"r","t":"..."}]}',
  ].join('\n')

  const parts: string[] = []
  if (input.context?.lines.length) parts.push(`Context:\n${input.context.lines.join('\n')}`)
  if (input.withSpeakers) parts.push('Speakers: ME = wearer, THEM = conversation partner, ? = unknown.')
  parts.push(`Conversation (most recent last):\n${formatForPrompt(input.segments, input.withSpeakers)}`)

  return {
    system,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
    // ~40 tokens per suggestion plus JSON overhead; CJK needs a bit more.
    maxTokens: 70 * input.count + 60,
    temperature: 0.7,
    json: true,
  }
}
