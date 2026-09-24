import type { Suggestion, SuggestionKind } from '../core/types'

/**
 * Wire format between the LLM and the app. Deliberately tiny to save output
 * tokens (= latency and cost):
 *
 *   {"s":[{"k":"q","t":"…"},{"k":"r","t":"…"}]}
 */
const KIND_CODES: Record<string, SuggestionKind> = {
  q: 'question',
  r: 'reply',
  t: 'topic',
  x: 'exit',
  b: 'recall',
  d: 'term',
  h: 'hint',
}

const CODE_OF: Record<SuggestionKind, string> = Object.fromEntries(
  Object.entries(KIND_CODES).map(([code, kind]) => [kind, code]),
) as Record<SuggestionKind, string>

export function encodeSuggestions(suggestions: readonly Suggestion[]): string {
  return JSON.stringify({ s: suggestions.map(s => ({ k: CODE_OF[s.kind], t: s.text })) })
}

/**
 * Parses a complete model answer. Tolerates code fences, prose around the
 * JSON, long kind names and a bare array. Drops empty or malformed items.
 */
export function parseSuggestions(output: string): Suggestion[] {
  const json = extractJson(output)
  if (json === undefined) return []
  const list = Array.isArray(json) ? json : (json as { s?: unknown; suggestions?: unknown }).s ?? (json as { suggestions?: unknown }).suggestions
  if (!Array.isArray(list)) return []

  const result: Suggestion[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const text = typeof rec.t === 'string' ? rec.t : typeof rec.text === 'string' ? rec.text : ''
    const kind = toKind(rec.k ?? rec.kind)
    if (text.trim() && kind) result.push({ kind, text: text.trim() })
  }
  return result
}

function toKind(value: unknown): SuggestionKind | null {
  if (typeof value !== 'string') return null
  const v = value.toLowerCase()
  if (v in KIND_CODES) return KIND_CODES[v]
  if ((Object.values(KIND_CODES) as string[]).includes(v)) return v as SuggestionKind
  return null
}

function extractJson(output: string): unknown {
  const start = output.search(/[[{]/)
  if (start < 0) return undefined
  const open = output[start]
  const close = open === '{' ? '}' : ']'
  const end = output.lastIndexOf(close)
  if (end <= start) return undefined
  try {
    return JSON.parse(output.slice(start, end + 1))
  } catch {
    return undefined
  }
}

const ITEM = /\{\s*"k"\s*:\s*"([a-z]+)"\s*,\s*"t"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g

/**
 * Extracts the suggestions that are already complete in a partially streamed
 * answer, so the first one can be shown before the model has finished.
 */
export function parsePartialSuggestions(partial: string): Suggestion[] {
  const result: Suggestion[] = []
  for (const match of partial.matchAll(ITEM)) {
    const kind = toKind(match[1])
    let text: string
    try {
      text = JSON.parse(`"${match[2]}"`) as string
    } catch {
      continue
    }
    if (kind && text.trim()) result.push({ kind, text: text.trim() })
  }
  return result
}
