import type { LanguageCode } from '../core/types'
import { isUiLanguage, type UiLanguage } from '../i18n'
import { isConversationLanguage, type ConversationLanguage } from '../stt/languages'
import { isSttProviderId, type SttProviderId } from '../stt/registry'

export const SETTINGS_VERSION = 1

export type MicSource = 'glasses' | 'phone'
export type RunMode = 'demo' | 'live'

/**
 * Persisted user settings. API keys are NOT part of this object – they live
 * under their own storage keys (see keys.ts) so they never end up in a
 * settings dump or log line.
 */
export interface Settings {
  version: typeof SETTINGS_VERSION
  uiLanguage: UiLanguage | 'auto'
  mode: RunMode
  micSource: MicSource
  /** Language of the scripted demo conversation. */
  demoLanguage: LanguageCode
  /** Suggestions visible at once on the glasses (1–3). */
  suggestionsPerPage: 1 | 2 | 3
  onboardingDone: boolean
  /** Language spoken in the conversation, or auto-detect (if the STT provider can). */
  conversationLanguage: ConversationLanguage | 'auto'
  sttProvider: SttProviderId | null
  /** Per-provider model override; empty = provider default. */
  sttModels: Partial<Record<SttProviderId, string>>
  /** Ask the STT provider for speaker labels (if supported). */
  diarization: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  uiLanguage: 'auto',
  mode: 'demo',
  micSource: 'glasses',
  demoLanguage: 'de',
  suggestionsPerPage: 2,
  onboardingDone: false,
  conversationLanguage: 'de',
  sttProvider: null,
  sttModels: {},
  diarization: true,
}

/**
 * Accepts whatever was stored (older versions, partial or corrupted data)
 * and returns a complete, valid Settings object.
 */
export function migrateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const r = raw as Record<string, unknown>
  const pick = <T>(value: unknown, valid: (v: unknown) => v is T, fallback: T): T =>
    valid(value) ? value : fallback

  return {
    version: SETTINGS_VERSION,
    uiLanguage: pick(r.uiLanguage, (v): v is UiLanguage | 'auto' => v === 'auto' || (typeof v === 'string' && isUiLanguage(v)), DEFAULT_SETTINGS.uiLanguage),
    mode: pick(r.mode, (v): v is RunMode => v === 'demo' || v === 'live', DEFAULT_SETTINGS.mode),
    micSource: pick(r.micSource, (v): v is MicSource => v === 'glasses' || v === 'phone', DEFAULT_SETTINGS.micSource),
    demoLanguage: pick(r.demoLanguage, (v): v is LanguageCode => v === 'de' || v === 'en' || v === 'ja', DEFAULT_SETTINGS.demoLanguage),
    suggestionsPerPage: pick(r.suggestionsPerPage, (v): v is 1 | 2 | 3 => v === 1 || v === 2 || v === 3, DEFAULT_SETTINGS.suggestionsPerPage),
    onboardingDone: pick(r.onboardingDone, (v): v is boolean => typeof v === 'boolean', DEFAULT_SETTINGS.onboardingDone),
    conversationLanguage: pick(r.conversationLanguage, (v): v is ConversationLanguage | 'auto' => v === 'auto' || isConversationLanguage(v), DEFAULT_SETTINGS.conversationLanguage),
    sttProvider: pick(r.sttProvider, (v): v is SttProviderId | null => v === null || isSttProviderId(v), DEFAULT_SETTINGS.sttProvider),
    sttModels: sanitizeModels(r.sttModels),
    diarization: pick(r.diarization, (v): v is boolean => typeof v === 'boolean', DEFAULT_SETTINGS.diarization),
  }
}

function sanitizeModels(raw: unknown): Settings['sttModels'] {
  if (!raw || typeof raw !== 'object') return {}
  const out: Settings['sttModels'] = {}
  for (const [id, model] of Object.entries(raw as Record<string, unknown>)) {
    if (isSttProviderId(id) && typeof model === 'string' && model.trim() && model.length <= 100) out[id] = model.trim()
  }
  return out
}
