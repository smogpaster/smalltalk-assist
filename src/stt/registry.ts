import { DEEPGRAM_DEFAULT_MODEL, DeepgramProvider } from './providers/deepgram'
import { GLADIA_DEFAULT_MODEL, GladiaProvider } from './providers/gladia'
import { SONIOX_DEFAULT_MODEL, SonioxProvider } from './providers/soniox'
import { SPEECHMATICS_DEFAULT_MODEL, SpeechmaticsProvider } from './providers/speechmatics'
import type { SttCapabilities, SttProvider } from './types'

export type SttProviderId = 'soniox' | 'deepgram' | 'speechmatics' | 'gladia'

export interface SttProviderInfo {
  id: SttProviderId
  name: string
  capabilities: SttCapabilities
  defaultModel: string
  /** Where users create a key. */
  keyUrl: string
  /** Origins the app talks to – must all be in the app.json network whitelist. */
  origins: readonly string[]
  create(apiKey: string, model?: string): SttProvider
}

const info = (entry: Omit<SttProviderInfo, 'capabilities'>): SttProviderInfo => ({
  ...entry,
  capabilities: entry.create('').capabilities,
})

export const STT_PROVIDERS: readonly SttProviderInfo[] = [
  info({
    id: 'soniox',
    name: 'Soniox',
    defaultModel: SONIOX_DEFAULT_MODEL,
    keyUrl: 'https://console.soniox.com',
    origins: ['https://api.soniox.com', 'wss://stt-rt.soniox.com'],
    create: (key, model) => new SonioxProvider(key, model || SONIOX_DEFAULT_MODEL),
  }),
  info({
    id: 'deepgram',
    name: 'Deepgram',
    defaultModel: DEEPGRAM_DEFAULT_MODEL,
    keyUrl: 'https://console.deepgram.com',
    origins: ['https://api.deepgram.com', 'wss://api.deepgram.com'],
    create: (key, model) => new DeepgramProvider(key, model || DEEPGRAM_DEFAULT_MODEL),
  }),
  info({
    id: 'speechmatics',
    name: 'Speechmatics',
    defaultModel: SPEECHMATICS_DEFAULT_MODEL,
    keyUrl: 'https://portal.speechmatics.com',
    origins: ['https://mp.speechmatics.com', 'wss://eu.rt.speechmatics.com'],
    create: (key, model) => new SpeechmaticsProvider(key, model || SPEECHMATICS_DEFAULT_MODEL),
  }),
  info({
    id: 'gladia',
    name: 'Gladia',
    defaultModel: GLADIA_DEFAULT_MODEL,
    keyUrl: 'https://app.gladia.io',
    origins: ['https://api.gladia.io', 'wss://api.gladia.io'],
    create: (key, model) => new GladiaProvider(key, model || GLADIA_DEFAULT_MODEL),
  }),
]

export function sttProviderInfo(id: string | null | undefined): SttProviderInfo | undefined {
  return STT_PROVIDERS.find(p => p.id === id)
}

export function isSttProviderId(value: unknown): value is SttProviderId {
  return STT_PROVIDERS.some(p => p.id === value)
}
