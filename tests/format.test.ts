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
