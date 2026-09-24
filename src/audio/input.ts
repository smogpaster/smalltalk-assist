import { AudioInputSource, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { BridgeQueue } from '../bridge/queue'
import type { AudioFrame, EventHub } from '../bridge/hub'
import type { MicSource } from '../settings/schema'

export interface AudioInput {
  /** Resolves false if the host refused to open the microphone. */
  start(source: MicSource, onFrame: (frame: AudioFrame) => void): Promise<boolean>
  stop(): Promise<void>
  /** Re-opens the mic after the host dropped it (e.g. app came back from background). */
  rearm(): Promise<void>
  readonly active: boolean
}

/**
 * Microphone through the Even bridge. `getUserMedia` is blocked in the
 * WebView, so this is the only audio path. Note: `audioControl(true)` returns
 * true even if the OS denied the permission – callers should watch for frames.
 */
export class BridgeAudioInput implements AudioInput {
  private unsubscribe: (() => void) | null = null
  private source: MicSource | null = null

  constructor(
    private readonly bridge: Pick<EvenAppBridge, 'audioControl'>,
    private readonly queue: BridgeQueue,
    private readonly hub: EventHub,
  ) {}

  get active(): boolean {
    return this.source !== null
  }

  async start(source: MicSource, onFrame: (frame: AudioFrame) => void): Promise<boolean> {
    await this.stop()
    this.unsubscribe = this.hub.onAudio(onFrame)
    const ok = await this.queue.run(() =>
      this.bridge.audioControl(true, source === 'phone' ? AudioInputSource.Phone : AudioInputSource.Glasses),
    )
    if (!ok) {
      this.unsubscribe()
      this.unsubscribe = null
      return false
    }
    this.source = source
    return true
  }

  async rearm(): Promise<void> {
    if (!this.source) return
    await this.queue.run(() =>
      this.bridge.audioControl(true, this.source === 'phone' ? AudioInputSource.Phone : AudioInputSource.Glasses),
    )
  }

  async stop(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.source === null) return
    this.source = null
    try {
      await this.queue.run(() => this.bridge.audioControl(false))
    } catch (err) {
      console.warn('[audio] stop failed', (err as Error).message)
    }
  }
}
