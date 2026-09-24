import type { TranscriptSegment } from '../core/types'
import type { LlmRequest } from '../llm/types'
import { formatForPrompt } from './transcript'

const LANGUAGE_NAMES: Record<string, string> = { de: 'German', en: 'English', ja: 'Japanese' }

export interface PromptInput {
  segments: readonly TranscriptSegment[]
  /** Language code for the suggestions. */
  outputLanguage: string
  count: number
  withSpeakers: boolean
}

/**
 * Builds the suggestion request. Kept short on purpose: every input token
 * adds latency. Profile/other-person context is added in milestone 5.
 */
export function buildSuggestionRequest(input: PromptInput): Pick<LlmRequest, 'system' | 'messages' | 'maxTokens' | 'json' | 'temperature'> {
  const language = LANGUAGE_NAMES[input.outputLanguage] ?? input.outputLanguage
  const system = [
    'You help the wearer of smart glasses keep a small-talk conversation going.',
    `Give ${input.count} short suggestions the wearer could say next, in ${language}.`,
    'Each suggestion: max 12 words, natural spoken language, no emoji.',
    'Kinds: "q" = question to ask, "r" = reply idea or anecdote hook.',
    'Answer ONLY with JSON: {"s":[{"k":"q","t":"..."}]}',
  ].join('\n')

  const transcript = formatForPrompt(input.segments, input.withSpeakers)
  const legend = input.withSpeakers ? 'ME = wearer, THEM = conversation partner.\n' : ''

  return {
    system,
    messages: [{ role: 'user', content: `${legend}Conversation so far:\n${transcript}` }],
    maxTokens: 60 * input.count + 20,
    temperature: 0.7,
    json: true,
  }
}
