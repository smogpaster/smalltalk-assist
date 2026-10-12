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

/** Topic keywords only: the wearer puts them into their own words. */
const KEYWORD_RULE = 'Write keywords, never sentences: 2-5 words each (Chinese, Japanese, Korean: at most 12 characters), no question, no verb phrase to read out, no punctuation at the end.'

function featureLines(features: PromptFeatures | undefined): string[] {
  if (!features) return []
  const out: string[] = []
  if (features.recall) out.push('One item may instead name something the partner mentioned earlier that could be picked up again now (kind "b", keywords, e.g. "Her move to Berlin").')
  if (features.terms) out.push('If the partner just used an uncommon technical term, abbreviation or name the wearer may not know, add one item of kind "d": "Term: explanation" (max 12 words). Otherwise no "d" item.')
  if (features.names) out.push('If someone introduced themselves or was named in the conversation, list them in "n": [{"n":"Name","i":"2-5 word note"}]. Otherwise "n": [].')
  return out
}

const SPECIAL_TASKS: Record<SpecialKind, { task: (count: number) => string; kind: string }> = {
  topic: {
    task: n => `The wearer wants to change the topic now. Suggest ${n} new topics that fit the background and the conversation so far and are easy to move to.`,
    kind: 't',
  },
  exit: {
    task: n => `The wearer wants to end the conversation now. Suggest ${n} polite, warm ways to wrap up as keywords (e.g. "Thanks + see you at the next meetup"), fitting the tone.`,
    kind: 'x',
  },
  recap: {
    task: () => 'Summarise the last minutes of the conversation for the wearer in at most 2 items of max 14 words each, focusing on what the partner said.',
    kind: 'h',
  },
  lull: {
    task: n => `The conversation has stalled. Suggest ${n} easy topics to get it going again, ideally tied to something said earlier or to the background.`,
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
    kind === 'recap'
      ? `Write in ${languageName(input.outputLanguage)}. Each item at most 14 words, no emoji, no quotation marks in the text.`
      : `Write in ${languageName(input.outputLanguage)}. ${KEYWORD_RULE} No emoji, no quotation marks in the text.`,
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
    `Suggest ${input.count} topics the wearer could bring up next, written in ${language}. The wearer talks in their own words; you only give the topic.`,
    KEYWORD_RULE,
    'Topics are concrete and tied to what was just said (a detail, a related experience, an angle worth asking about); no emoji; no quotation marks anywhere in the text; never a topic that was already covered.',
    'Use kind "a" for every topic.',
    'If the partner\'s last line is a question, the first topic must be keywords the wearer could draw on to answer exactly that question – not a formulated answer.',
    ...featureLines(input.features),
    ...contextLines(input.context),
    input.features?.names
      ? 'Answer ONLY with compact JSON: {"s":[{"k":"a","t":"..."}],"n":[]}'
      : 'Answer ONLY with compact JSON: {"s":[{"k":"a","t":"..."},{"k":"a","t":"..."}]}',
  ].join('\n')

  const parts: string[] = []
  if (input.withSpeakers) parts.push('Speakers: ME = wearer, THEM = conversation partner, ? = unknown.')
  parts.push(`Conversation (most recent last):\n${formatForPrompt(input.segments, input.withSpeakers)}`)

  return {
    system,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
    // Keywords are short; ~25 tokens per item plus JSON overhead, CJK a bit more.
    maxTokens: 40 * input.count + 60 + (input.features?.names ? 60 : 0) + (input.features?.terms ? 40 : 0),
    temperature: 0.7,
    json: true,
  }
}
