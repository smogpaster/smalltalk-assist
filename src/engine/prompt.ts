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

/** Profile and conversation-partner context (see profiles/context.ts). */
export interface PromptContext {
  /** Background: tone, goal, about the wearer, about the other person. */
  lines: string[]
  /** Topics that must not be brought up. */
  avoid: string[]
}

export interface PromptInput {
  segments: readonly TranscriptSegment[]
  /** Language code for the suggestions. */
  outputLanguage: string
  count: number
  withSpeakers: boolean
  context?: PromptContext
}

/**
 * Context goes into the system part: it is stable for the whole conversation
 * (cache friendly) and the avoid list is a rule, not a hint.
 */
function contextLines(context: PromptContext | undefined): string[] {
  if (!context) return []
  const out: string[] = []
  if (context.lines.length) out.push('Background (use only when it fits naturally, never recite it):', ...context.lines.map(l => `- ${l}`))
  if (context.avoid.length) out.push(`Never bring up or steer toward these topics: ${context.avoid.join('; ')}`)
  return out
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
    ...contextLines(input.context),
    'Answer ONLY with compact JSON: {"s":[{"k":"q","t":"..."},{"k":"r","t":"..."}]}',
  ].join('\n')

  const parts: string[] = []
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
