import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { describe, expect, it } from 'vitest'
import { InputNormalizer } from '../src/bridge/events'

const ev = (e: Record<string, unknown>) => e as unknown as EvenHubEvent

describe('InputNormalizer', () => {
  it('treats a sysEvent without eventType as a tap (protobuf drops 0)', () => {
    const n = new InputNormalizer()
    expect(n.normalize(ev({ sysEvent: { eventSource: 1 } }))).toEqual({ type: 'tap', source: 'glasses-right' })
  })

  it('does not invent a tap for events without an envelope (e.g. audio)', () => {
    const n = new InputNormalizer()
    expect(n.normalize(ev({ audioEvent: { audioPcm: new Uint8Array(4) } }))).toBeNull()
    expect(n.normalize(ev({}))).toBeNull()
  })

  it('accepts taps and double taps delivered as textEvent (simulator)', () => {
    const n = new InputNormalizer()
    expect(n.normalize(ev({ textEvent: {} }))?.type).toBe('tap')
    expect(n.normalize(ev({ textEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } }))?.type).toBe('doubleTap')
  })

  it('maps the ring as input source', () => {
    const n = new InputNormalizer()
    expect(n.normalize(ev({ sysEvent: { eventType: 3, eventSource: 2 } }))).toEqual({ type: 'doubleTap', source: 'ring' })
  })

  it('throttles scroll bursts', () => {
    let now = 0
    const n = new InputNormalizer({ now: () => now })
    const down = ev({ textEvent: { eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT } })
    expect(n.normalize(down)?.type).toBe('swipeDown')
    now = 100
    expect(n.normalize(down)).toBeNull()
    now = 450
    expect(n.normalize(down)?.type).toBe('swipeDown')
  })

  it('dedupes duplicate lifecycle events but not distinct ones', () => {
    let now = 0
    const n = new InputNormalizer({ now: () => now })
    const enter = ev({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT } })
    expect(n.normalize(enter)?.type).toBe('foregroundEnter')
    now = 80
    expect(n.normalize(enter)).toBeNull()
    now = 120
    expect(n.normalize(ev({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_EXIT_EVENT } }))?.type).toBe('foregroundExit')
  })

  it('maps long press, exit and menu clicks', () => {
    const n = new InputNormalizer()
    expect(n.normalize(ev({ sysEvent: { eventType: OsEventTypeList.LONG_PRESS_EVENT } }))?.type).toBe('longPress')
    expect(n.normalize(ev({ sysEvent: { eventType: OsEventTypeList.ABNORMAL_EXIT_EVENT } }))).toEqual({ type: 'exit', abnormal: true })
    expect(n.normalize(ev({ menuItemClickEvent: { itemID: 4 } }))).toEqual({ type: 'menu', itemId: 4 })
  })

  it('ignores IMU reports', () => {
    const n = new InputNormalizer()
    expect(n.normalize(ev({ sysEvent: { eventType: OsEventTypeList.IMU_DATA_REPORT, imuData: { x: 1 } } }))).toBeNull()
  })
})
