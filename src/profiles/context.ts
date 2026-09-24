import type { PromptContext } from '../engine/prompt'
import { isPersonEmpty, type OtherPerson, type Profile, type Tone } from './model'

const TONE_TEXT: Record<Tone, string> = {
  casual: 'casual and relaxed',
  professional: 'professional and polite',
  warm: 'warm and personal',
}

/**
 * Turns the active profile and the conversation partner into prompt context.
 * Labels are English (instructions for the model); the user's own text is
 * passed as typed, in whatever language it was written.
 */
export function buildPromptContext(profile: Profile | undefined, person: OtherPerson | undefined): PromptContext {
  const lines: string[] = []
  const avoid: string[] = []

  if (profile) {
    lines.push(`Tone of the wearer: ${TONE_TEXT[profile.tone]}.`)
    if (profile.goal.trim()) lines.push(`Wearer's goal for this conversation: ${oneLine(profile.goal)}`)
    if (profile.aboutMe.trim()) lines.push(`About the wearer (use when it fits naturally): ${oneLine(profile.aboutMe)}`)
    if (profile.avoidTopics.trim()) avoid.push(oneLine(profile.avoidTopics))
  }

  if (person && !isPersonEmpty(person)) {
    const who = [person.name.trim(), person.relation.trim() ? `(${person.relation.trim()})` : ''].filter(Boolean).join(' ')
    if (who) lines.push(`Conversation partner: ${who}`)
    if (person.interests.trim()) lines.push(`Their known interests: ${oneLine(person.interests)}`)
    if (person.mutualAcquaintances.trim()) lines.push(`Mutual acquaintances: ${oneLine(person.mutualAcquaintances)}`)
    if (person.bringUp.trim()) lines.push(`Good to bring up with them: ${oneLine(person.bringUp)}`)
    if (person.avoid.trim()) avoid.push(oneLine(person.avoid))
  }

  return { lines, avoid }
}

function oneLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, '; ')
}
