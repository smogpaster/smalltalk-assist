import { describe, expect, it } from 'vitest'
import { encodeSuggestions, parseSuggestions } from '../src/engine/format'

describe('suggestion wire format', () => {
  it('round-trips', () => {
    const list = [
      { kind: 'question' as const, text: 'Wie geht es dir?' },
      { kind: 'reply' as const, text: 'Gut, danke!' },
    ]
    expect(parseSuggestions(encodeSuggestions(list))).toEqual(list)
  })

  it('tolerates code fences and prose', () => {
    const out = 'Sure! Here you go:\n```json\n{"s":[{"k":"q","t":"Where are you from?"}]}\n```'
    expect(parseSuggestions(out)).toEqual([{ kind: 'question', text: 'Where are you from?' }])
  })

  it('accepts long field names and a bare array', () => {
    expect(parseSuggestions('[{"kind":"reply","text":"Nice!"}]')).toEqual([{ kind: 'reply', text: 'Nice!' }])
    expect(parseSuggestions('{"suggestions":[{"kind":"topic","text":"Travel"}]}')).toEqual([{ kind: 'topic', text: 'Travel' }])
  })

  it('drops malformed items and returns [] for garbage', () => {
    expect(parseSuggestions('{"s":[{"k":"zz","t":"x"},{"k":"q","t":"  "},{"k":"q","t":"ok"}]}')).toEqual([
      { kind: 'question', text: 'ok' },
    ])
    expect(parseSuggestions('no json here')).toEqual([])
    expect(parseSuggestions('{"s":[{"k":"q","t":"unterminated')).toEqual([])
  })
})

describe('parsePartialSuggestions', () => {
  it('returns only complete items of a streamed answer', async () => {
    const { parsePartialSuggestions } = await import('../src/engine/format')
    expect(parsePartialSuggestions('{"s":[{"k":"q","t":"Wie geht\\u0027s \\"dir\\"?"},{"k":"r","t":"Ich hab')).toEqual([
      { kind: 'question', text: 'Wie geht\'s "dir"?' },
    ])
    expect(parsePartialSuggestions('{"s":[')).toEqual([])
  })
})

describe('tolerant parsing', () => {
  it('reads items with unescaped quotes inside the text', async () => {
    const { parseSuggestions, parsePartialSuggestions } = await import('../src/engine/format')
    const broken = '{"s":[{"k":"x","t":"Sag einfach "Bis bald" und lächle."},{"k":"x","t":"Ich muss leider los – schön war\'s!"}]}'
    const expected = [
      { kind: 'exit', text: 'Sag einfach "Bis bald" und lächle.' },
      { kind: 'exit', text: "Ich muss leider los – schön war's!" },
    ]
    expect(parseSuggestions(broken)).toEqual(expected)
    expect(parsePartialSuggestions(broken.slice(0, broken.indexOf('},') + 1))).toEqual([expected[0]])
  })

  it('handles t before k and escaped newlines', async () => {
    const { looseItems } = await import('../src/engine/format')
    expect(looseItems('[{"t":"Zeile\\neins "x"","k":"h"}]')).toEqual([{ kind: 'hint', text: 'Zeile eins "x"' }])
  })

  it('outlines answers without their content', async () => {
    const { outline } = await import('../src/engine/format')
    expect(outline('{"s":[{"k":"x","t":"Geheimer Inhalt"}]}')).toBe('{~1:[{"k":"x","t":~15}]}'.replace('~1', '"s"'))
  })
})
