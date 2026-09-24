export type Tone = 'casual' | 'professional' | 'warm'
export const TONES: readonly Tone[] = ['casual', 'professional', 'warm']

/** A reusable setup for a kind of occasion ("Networking", "Family party"). */
export interface Profile {
  id: string
  name: string
  tone: Tone
  /** Hobbies, job, anecdotes – things the wearer can talk about. */
  aboutMe: string
  /** Topics the wearer does not want to get into. */
  avoidTopics: string
  /** Optional goal for conversations with this profile. */
  goal: string
}

/** Information about the person the wearer is talking to (one conversation). */
export interface OtherPerson {
  name: string
  relation: string
  interests: string
  mutualAcquaintances: string
  bringUp: string
  avoid: string
}

/** Every free-text field is capped: context goes into every request (cost + latency). */
export const FIELD_MAX = 600
export const NAME_MAX = 40

export const EMPTY_PERSON: OtherPerson = {
  name: '',
  relation: '',
  interests: '',
  mutualAcquaintances: '',
  bringUp: '',
  avoid: '',
}

export function isPersonEmpty(person: OtherPerson): boolean {
  return Object.values(person).every(v => !v.trim())
}

export function clip(text: unknown, max = FIELD_MAX): string {
  return typeof text === 'string' ? text.slice(0, max) : ''
}
