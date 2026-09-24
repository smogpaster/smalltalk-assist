import type { ProviderError } from '../core/errors'

export type SttTransport = 'websocket' | 'http-chunked'

export interface SttCapabilities {
  /** Real-time results while the person is still speaking. */
  streaming: boolean
  /** Speaker labels in the results. */
  diarization: boolean
  /** Supported conversation languages (BCP 47 primary subtags). */
  languages: readonly string[]
  /** Can detect the spoken language on its own. */
  autoDetect: boolean
  transports: readonly SttTransport[]
}

export interface SttSessionOptions {
  /** Language code or 'auto'. */
  language: string
  diarization: boolean
  sampleRate: 16000
}

/** Raw result from a provider, before the app maps speakers to self/other. */
export interface SttResult {
  /** Stable id of the utterance; interim results reuse it until final. */
  id: string
  text: string
  isFinal: boolean
  speakerLabel?: string
  language?: string
  startMs: number
  endMs: number
}

export interface SttCallbacks {
  onResult(result: SttResult): void
  onError(error: ProviderError): void
  /** The provider closed the stream (after close() or on its own). */
  onClosed?(): void
}

export interface SttSession {
  /** PCM s16le, 16 kHz, mono. */
  sendPcm(chunk: Uint8Array): void
  close(): Promise<void>
}

export interface SttProvider {
  readonly id: string
  readonly capabilities: SttCapabilities
  start(options: SttSessionOptions, callbacks: SttCallbacks): Promise<SttSession>
  /** Checks key + reachability without streaming real audio. */
  testConnection(): Promise<void>
}
