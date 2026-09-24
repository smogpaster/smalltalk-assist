import {
  CreateStartUpPageContainer,
  MenuContainerProperty,
  MenuItemProperty,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { BridgeQueue } from '../bridge/queue'
import { trace } from '../diag/trace'
import { BODY, HEADER, INPUT_LAYER, type GlassesMenuItem, type GlassesView } from './layout'

const INPUT_ID = 1
const INPUT_NAME = 'input'
const HEADER_ID = 2
const HEADER_NAME = 'status'
const BODY_ID = 3
const BODY_NAME = 'body'

/** Anything the renderer needs from the bridge – lets tests pass a fake. */
export type RenderBridge = Pick<
  EvenAppBridge,
  'createStartUpPageContainer' | 'rebuildPageContainer' | 'textContainerUpgrade'
>

const EMPTY_VIEW: GlassesView = { header: '', body: '', menu: [] }

/**
 * Owns the glasses page. Creates it once, then sends changed text via
 * flicker-free `textContainerUpgrade`. The contextual menu can only be set by
 * create/rebuild, so a menu change (rare: language switch) costs one rebuild.
 * Renders are coalesced: while one is in flight, only the latest view is kept.
 */
export class GlassesRenderer {
  private startupSpent = false
  private shown: GlassesView = EMPTY_VIEW
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
    if (this.startupSpent) return this.redraw(view)
    this.startupSpent = true
    const page = pageWith(view)
    let ok = false
    try {
      const result = await this.queue.run(
        () => this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page)),
        8000,
      )
      ok = result === StartUpPageCreateResult.success
      if (!ok) trace('glasses', 'startup page rejected', { result })
    } catch (err) {
      trace('glasses', 'startup page failed', { error: (err as Error).name })
    }
    if (!ok) return this.redraw(view)
    this.shown = view
    return true
  }

  /** Re-sends the full page, e.g. after the host cleared it (exit dialog, foreground). */
  async redraw(view: GlassesView): Promise<boolean> {
    try {
      const ok = await this.queue.run(() => this.bridge.rebuildPageContainer(new RebuildPageContainer(pageWith(view))))
      if (ok) this.shown = view
      else trace('glasses', 'rebuild rejected')
      return ok
    } catch (err) {
      trace('glasses', 'rebuild failed', { error: (err as Error).name })
      return false
    }
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
      if (!sameMenu(view.menu, this.shown.menu)) {
        await this.redraw(view)
        continue
      }
      if (view.header !== this.shown.header) {
        if (await this.upgrade(HEADER_ID, HEADER_NAME, view.header)) this.shown = { ...this.shown, header: view.header }
      }
      if (view.body !== this.shown.body) {
        if (await this.upgrade(BODY_ID, BODY_NAME, view.body)) this.shown = { ...this.shown, body: view.body }
      }
    }
  }

  private async upgrade(containerID: number, containerName: string, content: string): Promise<boolean> {
    try {
      const ok = await this.queue.run(() =>
        this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID, containerName, content: content || ' ' })),
      )
      if (!ok) trace('glasses', 'text update rejected', { container: containerName })
      return ok
    } catch (err) {
      trace('glasses', 'text update failed', { container: containerName, error: (err as Error).name })
      return false
    }
  }
}

function sameMenu(a: readonly GlassesMenuItem[], b: readonly GlassesMenuItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.label === b[i].label)
}

function pageWith(view: GlassesView) {
  const text = (props: Partial<TextContainerProperty>) =>
    new TextContainerProperty({ borderWidth: 0, isEventCapture: 0, ...props })
  return {
    containerTotalNum: 3,
    textObject: [
      // Back: invisible gesture layer (see INPUT_LAYER).
      text({
        xPosition: INPUT_LAYER.x,
        yPosition: INPUT_LAYER.y,
        width: INPUT_LAYER.width,
        height: INPUT_LAYER.height,
        paddingLength: 0,
        containerID: INPUT_ID,
        containerName: INPUT_NAME,
        content: ' ',
        isEventCapture: 1,
        zOrderIndex: 1,
      }),
      text({
        xPosition: HEADER.x,
        yPosition: HEADER.y,
        width: HEADER.width,
        height: HEADER.height,
        paddingLength: HEADER.padding,
        containerID: HEADER_ID,
        containerName: HEADER_NAME,
        content: view.header || ' ',
        zOrderIndex: 2,
      }),
      text({
        xPosition: BODY.x,
        yPosition: BODY.y,
        width: BODY.width,
        height: BODY.height,
        paddingLength: BODY.padding,
        containerID: BODY_ID,
        containerName: BODY_NAME,
        content: view.body || ' ',
        zOrderIndex: 3,
      }),
    ],
    // Omitting menuObject on rebuild clears our items, so always send it.
    menuObject: view.menu.length
      ? new MenuContainerProperty({
          menuItems: view.menu.map(item => new MenuItemProperty({ itemID: item.id, itemName: item.label })),
        })
      : undefined,
  }
}
