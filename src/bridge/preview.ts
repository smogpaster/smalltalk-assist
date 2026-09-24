import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk'
import type { RenderBridge } from '../display/renderer'
import type { AppEvent } from './events'
import type { EventHub } from './hub'

/**
 * Stand-in for the glasses when the app runs in a desktop browser: accepts
 * every render (the phone UI shows the glasses preview) and maps keys to
 * gestures – Space/Enter = tap, ↑/↓ = swipe, Q = long press.
 */
export const previewRenderBridge: RenderBridge & { shutDownPageContainer(mode?: number): Promise<boolean> } = {
  async createStartUpPageContainer() {
    return StartUpPageCreateResult.success
  },
  async rebuildPageContainer() {
    return true
  },
  async textContainerUpgrade() {
    return true
  },
  async shutDownPageContainer() {
    console.info('[preview] exit dialog would open on the glasses')
    return true
  },
}

export function attachPreviewKeys(hub: EventHub): void {
  const keys: Record<string, AppEvent> = {
    ' ': { type: 'tap', source: 'unknown' },
    Enter: { type: 'tap', source: 'unknown' },
    ArrowUp: { type: 'swipeUp', source: 'unknown' },
    ArrowDown: { type: 'swipeDown', source: 'unknown' },
    q: { type: 'longPress', source: 'unknown' },
  }
  window.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
    const appEvent = keys[event.key]
    if (!appEvent) return
    event.preventDefault()
    hub.emit(appEvent)
  })
}
