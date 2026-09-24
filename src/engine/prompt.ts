import type { SuggestionStyle, TranscriptSegment } from '../core/types'
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

/** Optional extras that ride along with the normal request (no extra calls). */
export interface PromptFeatures {
  /** Report names from introductions in "n". */
  names?: boolean
  /** Allow one suggestion that refers back to an earlier point (kind "b"). */
  recall?: boolean
  /** Explain an uncommon term the partner used (kind "d"). */
  terms?: boolean
}

export interface PromptInput {
  segments: readonly TranscriptSegment[]
  /** Language code for the suggestions. */
  outputLanguage: string
  count: number
  withSpeakers: boolean
  context?: PromptContext
  features?: PromptFeatures
  /** Default "mixed": reply ideas and questions. */
  style?: SuggestionStyle
}

/** On-demand requests from the contextual menu or the lull detector. */
export type SpecialKind = 'topic' | 'exit' | 'recap' | 'lull'

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

/** Which kinds to produce, and how to help with a question from the partner. */
function styleLines(style: SuggestionStyle): string[] {
  switch (style) {
    case 'mixed':
      return [
        'Mix kinds: "q" = a question to ask the other person, "r" = a reply idea or short anecdote hook.',
        'If the partner\'s last line is a question, the first suggestion must be a short answer idea to exactly that question (kind "r").',
      ]
    case 'hooks':
      return [
        'Never write out what the wearer should say. Use only these kinds: "a" = a keyword hook of 2-6 words the wearer can pick up in their own words (a topic, detail or angle), "q" = a follow-up question to ask the other person.',
        'If the partner\'s last line is a question, the first item must be kind "a": keywords the wearer could draw on to answer it – not a formulated answer.',
      ]
    case 'questions':
      return [
        'Use only kind "q": follow-up questions the wearer could ask the other person. Never write answers or statements for the wearer.',
        'If the partner\'s last line is a question, the wearer answers it themselves; suggest questions that fit once they have answered.',
      ]
  }
}

function featureLines(features: PromptFeatures | undefined): string[] {
  if (!features) return []
  const out: string[] = []
  if (features.recall) out.push('One suggestion may instead pick up something the partner mentioned earlier and could be continued now (kind "b", e.g. "You mentioned … – how did it go?").')
  if (features.terms) out.push('If the partner just used an uncommon technical term, abbreviation or name the wearer may not know, add one item of kind "d": "Term: explanation" (max 12 words). Otherwise no "d" item.')
  if (features.names) out.push('If someone introduced themselves or was named in the conversation, list them in "n": [{"n":"Name","i":"2-5 word note"}]. Otherwise "n": [].')
  return out
}

const SPECIAL_TASKS: Record<SpecialKind, { task: (count: number) => string; kind: string }> = {
  topic: {
    task: n => `The wearer wants to change the topic now. Suggest ${n} elegant, natural transitions to a new topic that fits the background and the conversation so far.`,
    kind: 't',
  },
  exit: {
    task: n => `The wearer wants to end the conversation now. Suggest ${n} polite, warm ways to wrap up (e.g. thank, refer to a next time), fitting the tone.`,
    kind: 'x',
  },
  recap: {
    task: () => 'Summarise the last minutes of the conversation for the wearer in at most 2 items of max 14 words each, focusing on what the partner said.',
    kind: 'h',
  },
  lull: {
    task: n => `The conversation has stalled. Suggest ${n} easy openers to get it going again, ideally tied to something said earlier or to the background.`,
    kind: 't',
  },
}

/** A single on-demand request (menu item or lull). */
export function buildSpecialRequest(kind: SpecialKind, input: Omit<PromptInput, 'features'>): Pick<LlmRequest, 'system' | 'messages' | 'maxTokens' | 'json' | 'temperature'> {
  const special = SPECIAL_TASKS[kind]
  const count = kind === 'recap' ? 2 : Math.min(input.count, 2)
  const system = [
    'You are a discreet conversation helper. The wearer of smart glasses reads your answer at a glance during a live conversation.',
    special.task(count),
    `Write in ${languageName(input.outputLanguage)}. Each item at most 14 words, no emoji, no quotation marks in the text.`,
    ...contextLines(input.context),
    `Answer ONLY with compact JSON: {"s":[{"k":"${special.kind}","t":"..."}]} – "k" is always "${special.kind}", do not number the items.`,
  ].join('\n')
  const parts: string[] = []
  if (input.withSpeakers) parts.push('Speakers: ME = wearer, THEM = conversation partner, ? = unknown.')
  parts.push(`Conversation (most recent last):\n${formatForPrompt(input.segments, input.withSpeakers) || '(nothing said yet)'}`)
  return { system, messages: [{ role: 'user', content: parts.join('\n\n') }], maxTokens: 70 * count + 60, temperature: 0.7, json: true }
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
    'Rules: at most 12 words each; natural spoken language; concrete and tied to what was just said; no emoji; no quotation marks anywhere in the text; never repeat what was already said.',
    ...styleLines(input.style ?? 'mixed'),
    ...featureLines(input.features),
    ...contextLines(input.context),
    input.features?.names
      ? 'Answer ONLY with compact JSON: {"s":[{"k":"q","t":"..."}],"n":[]}'
      : 'Answer ONLY with compact JSON: {"s":[{"k":"q","t":"..."},{"k":"r","t":"..."}]}',
  ].join('\n')

  const parts: string[] = []
  if (input.withSpeakers) parts.push('Speakers: ME = wearer, THEM = conversation partner, ? = unknown.')
  parts.push(`Conversation (most recent last):\n${formatForPrompt(input.segments, input.withSpeakers)}`)

  return {
    system,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
    // ~40 tokens per suggestion plus JSON overhead; CJK needs a bit more.
    maxTokens: 70 * input.count + 60 + (input.features?.names ? 60 : 0) + (input.features?.terms ? 40 : 0),
    temperature: 0.7,
    json: true,
  }
}
