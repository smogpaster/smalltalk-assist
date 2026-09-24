import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockSttProvider, buildTimeline } from '../src/mock/mockStt'
import { DEMO_SCRIPTS } from '../src/mock/scripts'
import type { SttResult } from '../src/stt/types'

describe('MockSttProvider', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps real-time pace when the host throttles timers', async () => {
    let clock = 0
    const results: SttResult[] = []
    const stt = new MockSttProvider('de', () => clock)
    const session = await stt.start({ language: 'de', diarization: true, sampleRate: 16000 }, {
      onResult: r => results.push(r),
      onError: () => {},
    })

    // One single (late) tick after 6 s of wall-clock time.
    clock = 6000
    await vi.advanceTimersByTimeAsync(150)

    const finals = results.filter(r => r.isFinal)
    expect(finals[0].text).toBe(DEMO_SCRIPTS.de[0].text)
    expect(finals[0].speakerLabel).toBe('1')
    // Interim steps of already finished utterances are skipped, not replayed.
    expect(results.filter(r => r.id === finals[0].id)).toHaveLength(1)
    await session.close()
  })

  it('loops the script with unique utterance ids', async () => {
    let clock = 0
    const results: SttResult[] = []
    const stt = new MockSttProvider('en', () => clock)
    await stt.start({ language: 'en', diarization: true, sampleRate: 16000 }, { onResult: r => results.push(r), onError: () => {} })
    const { duration } = buildTimeline(DEMO_SCRIPTS.en, 'en')
    clock = duration * 2 + 5000
    await vi.advanceTimersByTimeAsync(150)
    const finalIds = results.filter(r => r.isFinal).map(r => r.id)
    expect(finalIds.length).toBeGreaterThan(DEMO_SCRIPTS.en.length * 2)
    expect(new Set(finalIds).size).toBe(finalIds.length)
  })
})
