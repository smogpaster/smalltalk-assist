import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { BridgeQueue } from '../bridge/queue'
import { BODY, HEADER, type GlassesView } from './layout'

const HEADER_ID = 1
const HEADER_NAME = 'status'
const BODY_ID = 2
const BODY_NAME = 'body'

/** Anything the renderer needs from the bridge – lets tests pass a fake. */
export type RenderBridge = Pick<
  EvenAppBridge,
  'createStartUpPageContainer' | 'rebuildPageContainer' | 'textContainerUpgrade'
>

/**
 * Owns the glasses page. Creates it once, then only sends changed text via
 * flicker-free `textContainerUpgrade`. Renders are coalesced: while one is
 * in flight, only the most recent requested view is kept.
 */
export class GlassesRenderer {
  private startupSpent = false
  private shown: GlassesView = { header: '', body: '' }
  private pending: GlassesView | null = null
  private flushing: Promise<void> | null = null

  constructor(
    private readonly bridge: RenderBridge,
    private readonly queue: BridgeQueue,
  ) {}

  /**
   * Creates the startup page. `createStartUpPageContainer` is one-shot per
   * session: we latch "spent" even on failure (a retry blocks ~2 s and is
   * rejected) and fall back to a rebuild.
   */
  async init(view: GlassesView): Promise<boolean> {
    const page = pageWith(view)
    let ok: boolean
    if (!this.startupSpent) {
      this.startupSpent = true
      const result = await this.queue.run(
        () => this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page)),
        8000,
      )
      ok = result === StartUpPageCreateResult.success
      if (!ok) ok = await this.queue.run(() => this.bridge.rebuildPageContainer(new RebuildPageContainer(page)))
    } else {
      ok = await this.queue.run(() => this.bridge.rebuildPageContainer(new RebuildPageContainer(page)))
    }
    if (ok) this.shown = { ...view }
    return ok
  }

  /** Re-sends the full page, e.g. after the host cleared it (exit dialog, foreground). */
  async redraw(view: GlassesView): Promise<boolean> {
    const ok = await this.queue.run(() => this.bridge.rebuildPageContainer(new RebuildPageContainer(pageWith(view))))
    if (ok) this.shown = { ...view }
    return ok
  }

  render(view: GlassesView): Promise<void> {
    this.pending = view
    if (!this.flushing) {
      this.flushing = this.flush().finally(() => {
        this.flushing = null
      })
    }
    return this.flushing
  }

  private async flush(): Promise<void> {
    while (this.pending) {
      const view = this.pending
      this.pending = null
      if (view.header !== this.shown.header) {
        if (await this.upgrade(HEADER_ID, HEADER_NAME, view.header)) this.shown.header = view.header
      }
      if (view.body !== this.shown.body) {
        if (await this.upgrade(BODY_ID, BODY_NAME, view.body)) this.shown.body = view.body
      }
    }
  }

  private async upgrade(containerID: number, containerName: string, content: string): Promise<boolean> {
    try {
      return await this.queue.run(() =>
        this.bridge.textContainerUpgrade(
          new TextContainerUpgrade({ containerID, containerName, content: content || ' ' }),
        ),
      )
    } catch (err) {
      console.warn('[glasses] text update failed', (err as Error).message)
      return false
    }
  }
}

function pageWith(view: GlassesView) {
  return {
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        xPosition: HEADER.x,
        yPosition: HEADER.y,
        width: HEADER.width,
        height: HEADER.height,
        paddingLength: HEADER.padding,
        borderWidth: 0,
        containerID: HEADER_ID,
        containerName: HEADER_NAME,
        content: view.header || ' ',
        isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: BODY.x,
        yPosition: BODY.y,
        width: BODY.width,
        height: BODY.height,
        paddingLength: BODY.padding,
        borderWidth: 0,
        containerID: BODY_ID,
        containerName: BODY_NAME,
        content: view.body || ' ',
        // The body captures gestures; its text always fits, so swipes hit the
        // scroll boundary immediately and arrive as SCROLL_TOP/BOTTOM events.
        isEventCapture: 1,
      }),
    ],
  }
}
