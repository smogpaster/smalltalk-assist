import type { LanguageCode } from '../core/types'
import { isUiLanguage, type UiLanguage } from '../i18n'
import { isConversationLanguage, type ConversationLanguage } from '../stt/languages'
import { isSttProviderId, type SttProviderId } from '../stt/registry'
import { isLlmProviderId, type LlmProviderId } from '../llm/registry'

export const SETTINGS_VERSION = 2

export type MicSource = 'glasses' | 'phone'

/** Optional features (milestone 7), all off by default. */
export const EXTRA_IDS = ['topicChange', 'names', 'talkShare', 'lull', 'recall', 'terms', 'exitLine', 'recap'] as const
export type ExtraId = (typeof EXTRA_IDS)[number]
export type Extras = Record<ExtraId, boolean>
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
  llmProvider: LlmProviderId | null
  /** Per-provider model; empty = provider default (compatible presets need one). */
  llmModels: Partial<Record<LlmProviderId, string>>
  /** Language of the suggestions: same as the conversation, or a fixed one. */
  suggestionLanguage: 'same' | ConversationLanguage
  /** Pause after the other person's sentence before asking for suggestions. */
  pauseMs: 300 | 600 | 900 | 1500
  /** Minimum time between two LLM requests. */
  minIntervalSec: 3 | 6 | 10 | 20
  /** Maximum LLM requests per minute. */
  maxPerMinute: 3 | 6 | 10
  extras: Extras
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
  llmProvider: null,
  llmModels: {},
  suggestionLanguage: 'same',
  pauseMs: 300,
  minIntervalSec: 6,
  maxPerMinute: 6,
  extras: Object.fromEntries(EXTRA_IDS.map(id => [id, false])) as Extras,
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
    sttModels: sanitizeMap(r.sttModels, isSttProviderId),
    diarization: pick(r.diarization, (v): v is boolean => typeof v === 'boolean', DEFAULT_SETTINGS.diarization),
    llmProvider: pick(r.llmProvider, (v): v is LlmProviderId | null => v === null || isLlmProviderId(v), DEFAULT_SETTINGS.llmProvider),
    llmModels: sanitizeMap(r.llmModels, isLlmProviderId),
    suggestionLanguage: pick(r.suggestionLanguage, (v): v is Settings['suggestionLanguage'] => v === 'same' || isConversationLanguage(v), DEFAULT_SETTINGS.suggestionLanguage),
    // v1 defaulted to 900 ms on top of the STT's own end-of-sentence wait; v2 lowers the default.
    pauseMs: r.version === SETTINGS_VERSION
      ? pick(r.pauseMs, (v): v is Settings['pauseMs'] => [300, 600, 900, 1500].includes(v as number), DEFAULT_SETTINGS.pauseMs)
      : DEFAULT_SETTINGS.pauseMs,
    minIntervalSec: pick(r.minIntervalSec, (v): v is Settings['minIntervalSec'] => [3, 6, 10, 20].includes(v as number), DEFAULT_SETTINGS.minIntervalSec),
    maxPerMinute: pick(r.maxPerMinute, (v): v is Settings['maxPerMinute'] => [3, 6, 10].includes(v as number), DEFAULT_SETTINGS.maxPerMinute),
    extras: sanitizeExtras(r.extras),
  }
}

function sanitizeExtras(raw: unknown): Extras {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(EXTRA_IDS.map(id => [id, r[id] === true])) as Extras
}

/** Per-provider model names: known ids only, trimmed, non-empty, bounded. */
function sanitizeMap<K extends string>(raw: unknown, isKey: (v: unknown) => v is K): Partial<Record<K, string>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<K, string>> = {}
  for (const [id, model] of Object.entries(raw as Record<string, unknown>)) {
    if (isKey(id) && typeof model === 'string' && model.trim() && model.length <= 100) out[id] = model.trim()
  }
  return out
}
