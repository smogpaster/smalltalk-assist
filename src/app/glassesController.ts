import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppEvent } from '../bridge/events'
import type { EventHub } from '../bridge/hub'
import { trace } from '../diag/trace'
import type { BridgeQueue } from '../bridge/queue'
import { buildGlassesView, type GlassesView } from '../display/layout'
import type { GlassesRenderer } from '../display/renderer'
import type { Translate } from '../i18n'
import type { ConversationSession } from './session'

export interface GlassesControllerDeps {
  bridge: Pick<EvenAppBridge, 'shutDownPageContainer'>
  queue: BridgeQueue
  hub: EventHub
  renderer: GlassesRenderer
  session: ConversationSession
  translate: () => Translate
  /** Stop hardware and flush state; the WebView is about to close. */
  onExit(): Promise<void>
}

/**
 * Maps glasses gestures to session actions and keeps the glasses display in
 * sync with the session.
 *
 * Gestures (approved mapping):
 *   tap          start / stop the conversation
 *   swipe        page through suggestions
 *   long press   quiet mode on/off
 *   double tap   system exit dialog (Even Hub requirement on the root page)
 */
export class GlassesController {
  /**
   * While the exit dialog is open the host inverts the foreground events:
   * ENTER = dialog appeared (page was cleared), EXIT = user chose "No".
   */
  private exitDialogOpen = false

  constructor(private readonly deps: GlassesControllerDeps) {}

  start(): () => void {
    const offEvents = this.deps.hub.onEvent(event => void this.handle(event))
    const offSession = this.deps.session.subscribe(() => void this.deps.renderer.render(this.view()))
    return () => {
      offEvents()
      offSession()
    }
  }

  view(): GlassesView {
    const s = this.deps.session.snapshot()
    return buildGlassesView(
      {
        phase: s.phase === 'recording' ? 'recording' : s.phase === 'quiet' ? 'quiet' : 'idle',
        demo: s.demo,
        suggestions: s.suggestions,
        page: s.page,
        perPage: s.perPage,
        error: s.error ? this.deps.translate()(`error.${s.error.kind}`) : undefined,
      },
      this.deps.translate(),
    )
  }

  /** Re-render after a language change etc. */
  refresh(): void {
    void this.deps.renderer.render(this.view())
  }

  private async handle(event: AppEvent): Promise<void> {
    const session = this.deps.session
    switch (event.type) {
      case 'tap':
        if (session.isActive) await session.stop(`tap:${event.source}`)
        else await session.start(`tap:${event.source}`)
        return
      case 'swipeUp':
        session.movePage(-1)
        return
      case 'swipeDown':
        session.movePage(1)
        return
      case 'longPress':
        session.toggleQuiet()
        return
      case 'doubleTap':
        this.exitDialogOpen = true
        trace('glasses', 'exit dialog requested')
        await this.deps.queue.run(() => this.deps.bridge.shutDownPageContainer(1))
        return
      case 'foregroundEnter':
        trace('glasses', 'foreground enter', { dialog: this.exitDialogOpen })
        // Either the exit dialog appeared or we are back from background.
        // In both cases the host may have cleared our page: redraw it.
        await this.deps.renderer.redraw(this.view())
        if (!this.exitDialogOpen) await session.resume()
        return
      case 'foregroundExit':
        trace('glasses', 'foreground exit', { dialog: this.exitDialogOpen })
        if (this.exitDialogOpen) {
          // User cancelled the exit dialog – keep running.
          this.exitDialogOpen = false
          await this.deps.renderer.redraw(this.view())
        }
        return
      case 'exit':
        this.exitDialogOpen = false
        await session.stop(event.abnormal ? 'abnormal-exit' : 'system-exit')
        await this.deps.onExit()
        return
      case 'longPressRelease':
      case 'menu':
        return
    }
  }
}
