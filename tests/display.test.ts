import { describe, expect, it } from 'vitest'
import type { Suggestion } from '../src/core/types'
import { BODY_INNER_WIDTH, BODY_LINES, buildGlassesView, linesPerSuggestion, pageCount } from '../src/display/layout'
import { fitLines, lineCount, sanitizeForGlasses } from '../src/display/text'
import { createTranslator } from '../src/i18n'

const t = createTranslator('de')

describe('sanitizeForGlasses', () => {
  it('keeps umlauts, German quotes and Japanese', () => {
    expect(sanitizeForGlasses('Grüße „Hallo" 週末は？')).toBe('Grüße „Hallo" 週末は？')
  })

  it('replaces or drops glyphs the firmware font lacks', () => {
    expect(sanitizeForGlasses('Klar ✓ gern 💬 ↳ weiter')).toBe('Klar + gern → weiter')
    expect(sanitizeForGlasses('it’s')).toBe("it's")
  })
})

describe('fitLines', () => {
  const long = 'Das ist ein ziemlich langer Vorschlag, der auf keinen Fall in eine einzige Zeile auf der Brille passt, sondern mehrere braucht und dann gekürzt werden muss.'

  it('returns short text unchanged', () => {
    expect(fitLines('Kurz und gut.', BODY_INNER_WIDTH, 1)).toBe('Kurz und gut.')
  })

  it('truncates at a word boundary with an ellipsis', () => {
    const fitted = fitLines(long, BODY_INNER_WIDTH, 2)
    expect(lineCount(fitted, BODY_INNER_WIDTH)).toBeLessThanOrEqual(2)
    expect(fitted.endsWith('…')).toBe(true)
    expect(long.startsWith(fitted.slice(0, -1))).toBe(true)
  })

  it('handles CJK without spaces', () => {
    const ja = 'これはとても長い日本語の文章で、スペースがないので文字単位で切り詰める必要があります。'.repeat(3)
    const fitted = fitLines(ja, BODY_INNER_WIDTH, 2)
    expect(lineCount(fitted, BODY_INNER_WIDTH)).toBeLessThanOrEqual(2)
    expect(fitted.endsWith('…')).toBe(true)
  })
})

describe('glasses layout', () => {
  const suggestions: Suggestion[] = [
    { kind: 'question', text: 'Wie bist du zum Segeln gekommen?' },
    { kind: 'reply', text: 'Ich war einmal auf der Ostsee.' },
    { kind: 'question', text: 'Seit wann segelst du?' },
  ]

  it('never overflows the body for 1–3 suggestions per page', () => {
    for (const perPage of [1, 2, 3]) {
      const longOnes = suggestions.map(s => ({ ...s, text: s.text.repeat(6) }))
      const view = buildGlassesView({ phase: 'recording', demo: false, suggestions: longOnes, page: 0, perPage }, t)
      expect(lineCount(view.body, BODY_INNER_WIDTH)).toBeLessThanOrEqual(BODY_LINES)
      expect(linesPerSuggestion(perPage)).toBeGreaterThanOrEqual(2)
    }
  })

  it('shows a page counter and the right slice', () => {
    const view = buildGlassesView({ phase: 'recording', demo: false, suggestions, page: 1, perPage: 2 }, t)
    expect(view.header).toMatch(/^● REC\s+2\/2$/)
    expect(view.body).toBe('? Seit wann segelst du?')
    expect(pageCount(3, 2)).toBe(2)
  })

  it('clamps an out-of-range page', () => {
    const view = buildGlassesView({ phase: 'recording', demo: false, suggestions, page: 9, perPage: 3 }, t)
    expect(view.body.split('\n\n')).toHaveLength(3)
  })

  it('shows instructions when idle and hides suggestions in quiet mode', () => {
    expect(buildGlassesView({ phase: 'idle', demo: true, suggestions, page: 0, perPage: 2 }, t)).toEqual({
      header: '○ Bereit  DEMO',
      body: 'Tippen: Gespräch starten\nDoppeltippen: Beenden',
      menu: [],
    })
    expect(buildGlassesView({ phase: 'quiet', demo: false, suggestions, page: 0, perPage: 2 }, t).body).not.toContain('Segeln')
  })

  it('shows errors instead of stale suggestions', () => {
    const view = buildGlassesView({ phase: 'recording', demo: false, suggestions, page: 0, perPage: 2, error: 'Key abgelehnt' }, t)
    expect(view.body).toBe('! Key abgelehnt')
  })
})
