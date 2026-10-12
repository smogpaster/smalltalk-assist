import { describe, expect, it } from 'vitest'
import { buildGlassesView } from '../src/display/layout'
import { buildSpecialRequest, buildSuggestionRequest } from '../src/engine/prompt'
import { createTranslator } from '../src/i18n'
import { DEMO_SCRIPTS } from '../src/mock/scripts'
import { migrateSettings } from '../src/settings/schema'

const segments = [{ id: '1', text: 'Und was machst du so?', isFinal: true, speaker: 'other' as const, startMs: 0, endMs: 1 }]
const input = { segments, outputLanguage: 'de', count: 3, withSpeakers: true }

describe('topic keywords instead of sentences', () => {
  it('asks for topic keywords of kind "a" only', () => {
    const { system } = buildSuggestionRequest(input)
    expect(system).toContain('topics the wearer could bring up')
    expect(system).toContain('Write keywords, never sentences: 2-5 words')
    expect(system).toContain('Use kind "a" for every topic')
    expect(system).not.toMatch(/"k":"[qr]"/)
  })

  it('helps with a partner question through keywords, not an answer', () => {
    expect(buildSuggestionRequest(input).system).toContain('keywords the wearer could draw on to answer exactly that question – not a formulated answer')
  })

  it('menu requests ask for keywords too, except the recap', () => {
    for (const kind of ['topic', 'exit', 'lull'] as const) {
      expect(buildSpecialRequest(kind, input).system).toContain('Write keywords, never sentences')
    }
    expect(buildSpecialRequest('recap', input).system).not.toContain('Write keywords')
  })

  it('callbacks are keywords as well', () => {
    const { system } = buildSuggestionRequest({ ...input, features: { recall: true } })
    expect(system).toContain('kind "b", keywords')
  })

  it('demo suggestions are short keywords without question marks', () => {
    for (const lines of Object.values(DEMO_SCRIPTS)) {
      for (const s of lines.flatMap(l => l.suggestions ?? [])) {
        expect(s.text).not.toMatch(/[?？]/)
        expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(5)
      }
    }
  })

  it('shows topics with the arrow marker; the old style setting is dropped', () => {
    const view = buildGlassesView({ phase: 'recording', demo: false, suggestions: [{ kind: 'hook', text: 'Segeln Kroatien' }], page: 0, perPage: 2 }, createTranslator('de'))
    expect(view.body).toBe('→ Segeln Kroatien')
    expect(migrateSettings({ suggestionStyle: 'mixed' })).not.toHaveProperty('suggestionStyle')
  })
})
