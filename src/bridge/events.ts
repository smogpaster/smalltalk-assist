import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'

export type InputSource = 'glasses-right' | 'glasses-left' | 'ring' | 'unknown'

export type AppEvent =
  | { type: 'tap'; source: InputSource }
  | { type: 'doubleTap'; source: InputSource }
  | { type: 'swipeUp'; source: InputSource }
  | { type: 'swipeDown'; source: InputSource }
  | { type: 'longPress'; source: InputSource }
  | { type: 'longPressRelease'; source: InputSource }
  | { type: 'menu'; itemId: number }
  | { type: 'foregroundEnter' }
  | { type: 'foregroundExit' }
  | { type: 'exit'; abnormal: boolean }

export interface NormalizerOptions {
  /** One swipe can fire several scroll events; ignore repeats within this window. */
  scrollCooldownMs?: number
  /** Firmware emits duplicate lifecycle events ~50–100 ms apart. */
  lifecycleDedupeMs?: number
  now?: () => number
}

/**
 * Turns raw SDK events into app events. Handles the known quirks:
 * - CLICK_EVENT is 0 and protobuf drops zero values, so a tap arrives with
 *   `eventType` undefined — but only *inside* an envelope that exists.
 * - Hardware reports taps via sysEvent, the simulator sometimes via textEvent.
 * - Scroll bursts and duplicate lifecycle events.
 * Audio frames are not handled here (see audio/).
 */
export class InputNormalizer {
  private readonly scrollCooldownMs: number
  private readonly lifecycleDedupeMs: number
  private readonly now: () => number
  private lastScrollAt = -Infinity
  private lastLifecycle: { type: number; at: number } | null = null

  constructor(options: NormalizerOptions = {}) {
    this.scrollCooldownMs = options.scrollCooldownMs ?? 300
    this.lifecycleDedupeMs = options.lifecycleDedupeMs ?? 600
    this.now = options.now ?? (() => Date.now())
  }

  normalize(event: EvenHubEvent): AppEvent | null {
    if (event.menuItemClickEvent) {
      const itemId = event.menuItemClickEvent.itemID
      return itemId ? { type: 'menu', itemId } : null
    }

    const envelope = event.sysEvent ?? event.textEvent ?? event.listEvent
    if (!envelope) return null

    const type: OsEventTypeList = envelope.eventType ?? OsEventTypeList.CLICK_EVENT
    const source = sourceOf(event.sysEvent?.eventSource)

    switch (type) {
      case OsEventTypeList.CLICK_EVENT:
        // A sysEvent that only carries IMU data is not a tap.
        if (event.sysEvent?.imuData) return null
        return { type: 'tap', source }
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        return { type: 'doubleTap', source }
      case OsEventTypeList.SCROLL_TOP_EVENT:
      case OsEventTypeList.SCROLL_BOTTOM_EVENT: {
        const at = this.now()
        if (at - this.lastScrollAt < this.scrollCooldownMs) return null
        this.lastScrollAt = at
        return { type: type === OsEventTypeList.SCROLL_TOP_EVENT ? 'swipeUp' : 'swipeDown', source }
      }
      case OsEventTypeList.LONG_PRESS_EVENT:
        return { type: 'longPress', source }
      case OsEventTypeList.LONG_PRESS_RELEASE_EVENT:
        return { type: 'longPressRelease', source }
      case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      case OsEventTypeList.SYSTEM_EXIT_EVENT: {
        if (this.isDuplicateLifecycle(type)) return null
        if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) return { type: 'foregroundEnter' }
        if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) return { type: 'foregroundExit' }
        return { type: 'exit', abnormal: type === OsEventTypeList.ABNORMAL_EXIT_EVENT }
      }
      default:
        return null
    }
  }

  private isDuplicateLifecycle(type: number): boolean {
    const at = this.now()
    const last = this.lastLifecycle
    this.lastLifecycle = { type, at }
    return last !== null && last.type === type && at - last.at < this.lifecycleDedupeMs
  }
}

function sourceOf(raw: number | undefined): InputSource {
  switch (raw) {
    case 1:
      return 'glasses-right'
    case 2:
      return 'ring'
    case 3:
      return 'glasses-left'
    default:
      return 'unknown'
  }
}
