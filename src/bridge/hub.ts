import { AudioSpeakerRole, type EvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import type { Speaker } from '../core/types'
import { InputNormalizer, type AppEvent } from './events'

export interface AudioFrame {
  /** PCM s16le, 16 kHz, mono. */
  pcm: Uint8Array
  /** Even app's own per-frame speaker classification (glasses mic only). */
  speakerRole: Speaker
  /** Raw direction tag from the glasses, null for the phone mic. */
  direction: number | null
}

type Listener<T> = (value: T) => void

/**
 * The single `onEvenHubEvent` subscription of the app. Splits the stream into
 * audio frames and normalized input/lifecycle events.
 */
export class EventHub {
  private readonly normalizer = new InputNormalizer()
  private readonly audioListeners = new Set<Listener<AudioFrame>>()
  private readonly eventListeners = new Set<Listener<AppEvent>>()
  private unsubscribe: (() => void) | null = null

  attach(bridge: Pick<EvenAppBridge, 'onEvenHubEvent'>): void {
    this.detach()
    this.unsubscribe = bridge.onEvenHubEvent(event => this.dispatch(event))
  }

  detach(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  onAudio(listener: Listener<AudioFrame>): () => void {
    this.audioListeners.add(listener)
    return () => this.audioListeners.delete(listener)
  }

  onEvent(listener: Listener<AppEvent>): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /** Public for tests and for the browser preview's keyboard shortcuts. */
  emit(event: AppEvent): void {
    for (const listener of this.eventListeners) listener(event)
  }

  private dispatch(event: EvenHubEvent): void {
    const audio = event.audioEvent
    if (audio?.audioPcm) {
      const frame: AudioFrame = {
        pcm: audio.audioPcm,
        speakerRole: toSpeaker(audio.speakerRole),
        direction: audio.direction ?? null,
      }
      for (const listener of this.audioListeners) listener(frame)
      return
    }
    const appEvent = this.normalizer.normalize(event)
    if (appEvent) this.emit(appEvent)
  }
}

function toSpeaker(role: AudioSpeakerRole | undefined): Speaker {
  if (role === AudioSpeakerRole.Self) return 'self'
  if (role === AudioSpeakerRole.Other) return 'other'
  return 'unknown'
}
