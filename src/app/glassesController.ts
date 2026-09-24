import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppEvent } from '../bridge/events'
import type { EventHub } from '../bridge/hub'
import { trace } from '../diag/trace'
import type { BridgeQueue } from '../bridge/queue'
import { buildGlassesView, type GlassesView } from '../display/layout'
import type { GlassesRenderer } from '../display/renderer'
import type { Translate } from '../i18n'
import type { Extras } from '../settings/schema'
import { MenuId, buildMenu } from './menu'
import type { ConversationSession } from './session'

export interface GlassesControllerDeps {
  bridge: Pick<EvenAppBridge, 'shutDownPageContainer'>
  queue: BridgeQueue
  hub: EventHub
  renderer: GlassesRenderer
  session: ConversationSession
  translate: () => Translate
  /** Enabled extras (menu items, hints). */
  extras: () => Extras
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
 *   tap + long press   OS contextual menu (start/stop, quiet, later extras)
 *
 * Because the menu gesture begins with a tap, a tap is only acted on after a
 * short grace period without a following long press.
 */
const TAP_GRACE_MS = 450

export class GlassesController {
  /**
   * While the exit dialog is open the host inverts the foreground events:
   * ENTER = dialog appeared (page was cleared), EXIT = user chose "No".
   */
  private exitDialogOpen = false
  /**
   * The OS contextual menu fires ENTER, (click), EXIT while our page stays
   * mounted – no redraw needed. A real background trip is EXIT first, then
   * ENTER later; then the page may need a redraw and the mic a re-arm.
   */
  private overlayOpen = false
  private backgrounded = false
  private pendingTap: ReturnType<typeof setTimeout> | null = null
  private pendingTapAt = 0

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
        preview: s.transcriptOnly ? s.transcript.at(-1)?.text : undefined,
        reconnecting: s.reconnecting,
        hint: s.talkShareWarning !== null ? this.deps.translate()('extra.talkShare.hint', { pct: s.talkShareWarning }) : undefined,
      },
      this.deps.translate(),
      buildMenu(this.deps.translate(), this.deps.extras()),
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
        this.cancelPendingTap()
        this.pendingTapAt = Date.now()
        this.pendingTap = setTimeout(() => {
          this.pendingTap = null
          void this.toggleSession(`tap:${event.source}`)
        }, TAP_GRACE_MS)
        return
      case 'swipeUp':
        session.movePage(-1)
        return
      case 'swipeDown':
        session.movePage(1)
        return
      case 'longPress':
        // Throttled timers can fire late; compare wall-clock time as well.
        if (this.pendingTap && Date.now() - this.pendingTapAt < TAP_GRACE_MS * 2) {
          this.cancelPendingTap()
          trace('glasses', 'tap + long press: menu gesture')
          return
        }
        session.toggleQuiet()
        return
      case 'doubleTap':
        this.exitDialogOpen = true
        trace('glasses', 'exit dialog requested')
        await this.deps.queue.run(() => this.deps.bridge.shutDownPageContainer(1))
        return
      case 'foregroundEnter':
        trace('glasses', 'foreground enter', { dialog: this.exitDialogOpen, backgrounded: this.backgrounded })
        if (this.exitDialogOpen) {
          // The exit dialog appeared; the host cleared our page.
          await this.deps.renderer.redraw(this.view())
        } else if (this.backgrounded) {
          this.backgrounded = false
          await this.deps.renderer.redraw(this.view())
          await session.resume()
        } else {
          this.overlayOpen = true
        }
        return
      case 'foregroundExit':
        trace('glasses', 'foreground exit', { dialog: this.exitDialogOpen, overlay: this.overlayOpen })
        if (this.exitDialogOpen) {
          // User cancelled the exit dialog – keep running.
          this.exitDialogOpen = false
          await this.deps.renderer.redraw(this.view())
        } else if (this.overlayOpen) {
          this.overlayOpen = false
        } else {
          this.backgrounded = true
        }
        return
      case 'exit':
        this.exitDialogOpen = false
        await session.stop(event.abnormal ? 'abnormal-exit' : 'system-exit')
        await this.deps.onExit()
        return
      case 'menu':
        trace('glasses', 'menu item', { id: event.itemId })
        if (event.itemId === MenuId.toggleSession) await this.toggleSession('menu')
        else if (event.itemId === MenuId.quiet) session.toggleQuiet()
        else if (event.itemId === MenuId.topic) session.requestSpecial('topic')
        else if (event.itemId === MenuId.exitLine) session.requestSpecial('exit')
        else if (event.itemId === MenuId.recap) session.requestSpecial('recap')
        else if (event.itemId === MenuId.names) this.showNames()
        return
      case 'longPressRelease':
        return
    }
  }

  private showNames(): void {
    const t = this.deps.translate()
    const names = this.deps.session.snapshot().names
    this.deps.session.showInfo(
      names.length
        ? names.map(n => ({ kind: 'hint' as const, text: n.note ? `${n.name} – ${n.note}` : n.name }))
        : [{ kind: 'hint' as const, text: t('extra.names.none') }],
    )
  }

  private async toggleSession(reason: string): Promise<void> {
    const session = this.deps.session
    if (session.isActive) await session.stop(reason)
    else await session.start(reason)
  }

  private cancelPendingTap(): void {
    if (this.pendingTap) clearTimeout(this.pendingTap)
    this.pendingTap = null
  }
}
