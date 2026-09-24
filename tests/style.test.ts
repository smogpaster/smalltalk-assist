import { describe, expect, it } from 'vitest'
import { filterByStyle } from '../src/app/session'
import type { Suggestion } from '../src/core/types'
import { parseSuggestions } from '../src/engine/format'
import { buildSuggestionRequest } from '../src/engine/prompt'
import { buildGlassesView } from '../src/display/layout'
import { createTranslator } from '../src/i18n'
import { migrateSettings } from '../src/settings/schema'

const segments = [{ id: '1', text: 'Und was machst du so?', isFinal: true, speaker: 'other' as const, startMs: 0, endMs: 1 }]
const request = (style?: 'mixed' | 'hooks' | 'questions') =>
  buildSuggestionRequest({ segments, outputLanguage: 'de', count: 3, withSpeakers: true, style })

describe('suggestion style', () => {
  it('mixed (default) asks for reply ideas and questions', () => {
    expect(request().system).toContain('"r" = a reply idea')
    expect(request('mixed').system).toBe(request().system)
  })

  it('hooks forbids formulated replies and asks for keywords', () => {
    const system = request('hooks').system
    expect(system).toContain('Never write out what the wearer should say')
    expect(system).toContain('"a" = a keyword hook')
    expect(system).not.toContain('"r" = a reply idea')
  })

  it('questions asks for questions only', () => {
    const system = request('questions').system
    expect(system).toContain('Use only kind "q"')
    expect(system).not.toContain('"r" = a reply idea')
  })

  it('parses hooks and filters kinds per style', () => {
    const parsed = parseSuggestions('{"s":[{"k":"a","t":"Segeln Kroatien – Sturm"},{"k":"r","t":"Ich segle auch."},{"k":"q","t":"Wo genau?"}]}')
    expect(parsed.map(s => s.kind)).toEqual(['hook', 'reply', 'question'])
    const kinds = (list: Suggestion[]) => list.map(s => s.kind)
    expect(kinds(filterByStyle(parsed, 'mixed'))).toEqual(['hook', 'reply', 'question'])
    expect(kinds(filterByStyle(parsed, 'hooks'))).toEqual(['hook', 'question'])
    expect(kinds(filterByStyle(parsed, 'questions'))).toEqual(['question'])
  })

  it('shows hooks with the arrow marker and keeps the setting valid', () => {
    const view = buildGlassesView({ phase: 'recording', demo: false, suggestions: [{ kind: 'hook', text: 'Segeln Kroatien' }], page: 0, perPage: 2 }, createTranslator('de'))
    expect(view.body).toBe('→ Segeln Kroatien')
    expect(migrateSettings({ suggestionStyle: 'hooks' }).suggestionStyle).toBe('hooks')
    expect(migrateSettings({ suggestionStyle: 'nonsense' }).suggestionStyle).toBe('mixed')
  })
})
