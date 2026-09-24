import type { Speaker } from '../core/types'

/**
 * Maps provider diarization labels to self/other. Milestone 1 only knows a
 * fixed self label; milestone 6 adds automatic mapping from the glasses'
 * per-frame speakerRole, calibration and manual swapping.
 */
export class SpeakerMapper {
  constructor(private selfLabel: string | null = null) {}

  map(label: string | undefined): Speaker {
    if (label === undefined || this.selfLabel === null) return 'unknown'
    return label === this.selfLabel ? 'self' : 'other'
  }

  setSelfLabel(label: string | null): void {
    this.selfLabel = label
  }

  get hasMapping(): boolean {
    return this.selfLabel !== null
  }
}
