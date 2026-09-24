import { describe, expect, it } from 'vitest'
import { SpeakerMapper } from '../src/speakers/mapper'

/** Simulates 50 ms glasses frames with a fixed role over [fromMs, toMs). */
function frames(mapper: SpeakerMapper, fromMs: number, toMs: number, role: 'self' | 'other' | 'unknown') {
  for (let t = fromMs; t < toMs; t += 50) mapper.observe(t, t + 50, role)
}

describe('SpeakerMapper', () => {
  it('classifies by the glasses frame roles inside the utterance', () => {
    const m = new SpeakerMapper()
    frames(m, 0, 2000, 'self')
    frames(m, 2000, 4000, 'other')
    expect(m.classify('1', 100, 1900, true)).toBe('self')
    expect(m.classify('2', 2100, 3900, true)).toBe('other')
  })

  it('tolerates a few misclassified frames but stays unknown when mixed', () => {
    const m = new SpeakerMapper()
    frames(m, 0, 800, 'self')
    frames(m, 800, 1000, 'other')
    expect(m.classify(undefined, 0, 1000, true)).toBe('self')
    const mixed = new SpeakerMapper()
    frames(mixed, 0, 500, 'self')
    frames(mixed, 500, 1000, 'other')
    expect(mixed.classify(undefined, 0, 1000, true)).toBe('unknown')
  })

  it('learns diarization labels and uses them when frames are missing', () => {
    const m = new SpeakerMapper()
    frames(m, 0, 1000, 'self')
    frames(m, 1000, 2000, 'self')
    m.classify('A', 0, 1000, true)
    m.classify('A', 1000, 2000, true)
    // No frames for this span (e.g. short word): the label decides.
    expect(m.classify('A', 5000, 5200, true)).toBe('self')
    expect(m.classify('B', 5000, 5200, true)).toBe('unknown')
  })

  it('keeps label knowledge across a new STT stream (timeline reset)', () => {
    const m = new SpeakerMapper()
    frames(m, 0, 2000, 'other')
    m.classify('2', 0, 1000, true)
    m.classify('2', 1000, 2000, true)
    m.resetTimeline()
    expect(m.classify('2', 0, 500, false)).toBe('other')
  })

  it('calibration: the next final utterance defines the wearer label', () => {
    const m = new SpeakerMapper()
    m.markNextAsSelf()
    expect(m.isCalibrating).toBe(true)
    expect(m.classify('S2', 0, 1000, false)).toBe('unknown')
    expect(m.classify('S2', 0, 1000, true)).toBe('self')
    expect(m.isCalibrating).toBe(false)
    expect(m.classify('S1', 2000, 3000, true)).toBe('other')
    expect(m.classify('S2', 4000, 5000, true)).toBe('self')
  })

  it('swap flips every decision', () => {
    const m = new SpeakerMapper()
    m.setSelfLabel('0')
    m.swap()
    expect(m.classify('0', 0, 100, true)).toBe('other')
    expect(m.classify('1', 0, 100, true)).toBe('self')
  })

  it('ignores unknown frames', () => {
    const m = new SpeakerMapper()
    frames(m, 0, 2000, 'unknown')
    expect(m.classify(undefined, 0, 2000, true)).toBe('unknown')
  })
})
