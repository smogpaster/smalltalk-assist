import type { LlmProviderId } from '../llm/registry'
import type { Settings } from '../settings/schema'
import type { SttProviderId } from '../stt/registry'

/**
 * Rough cost estimate for one hour of conversation. List prices in USD as
 * published on the providers' pricing pages on PRICES_DATE; they change, so
 * the UI always labels the result as an estimate with this date.
 */
export const PRICES_DATE = '2026-09-24'

/** USD per hour of streamed audio (null = no clear public price). */
const STT_PER_HOUR: Record<SttProviderId, { base: number | null; diarization?: number; autoLanguage?: number }> = {
  soniox: { base: 0.12 }, // diarization and language id included
  deepgram: { base: 0.288, diarization: 0.12, autoLanguage: 0.348 }, // nova-3 streaming; "multi" priced separately
  speechmatics: { base: null },
  gladia: { base: 0.75 },
}

/** USD per 1M tokens for the default model of each provider (other models: unknown). */
const LLM_PRICES: Partial<Record<LlmProviderId, { model: string; input: number; output: number }>> = {
  anthropic: { model: 'claude-haiku-4-5', input: 1, output: 5 },
  openai: { model: 'gpt-6-luna', input: 0.1, output: 0.5 },
  gemini: { model: 'gemini-3.5-flash-lite', input: 0.3, output: 2.5 },
  mistral: { model: 'mistral-small-latest', input: 0.15, output: 0.6 },
}

/** Assumptions for a lively conversation. */
const TYPICAL_REQUESTS_PER_HOUR = 120
const INPUT_TOKENS_PER_REQUEST = 1200
const OUTPUT_TOKENS_PER_REQUEST = 150

export interface CostEstimate {
  /** USD per hour, null when unknown. */
  stt: number | null
  llm: number | null
  total: number | null
  requestsPerHour: number
}

export function estimateHourlyCost(settings: Settings): CostEstimate {
  const requestsPerHour = Math.min(
    TYPICAL_REQUESTS_PER_HOUR,
    settings.maxPerMinute * 60,
    Math.floor(3600 / settings.minIntervalSec),
  )

  let stt: number | null = null
  if (settings.sttProvider) {
    const price = STT_PER_HOUR[settings.sttProvider]
    if (price.base !== null) {
      const base = settings.conversationLanguage === 'auto' && price.autoLanguage ? price.autoLanguage : price.base
      stt = base + (settings.diarization && price.diarization ? price.diarization : 0)
    }
  }

  let llm: number | null = 0
  if (settings.llmProvider) {
    const price = LLM_PRICES[settings.llmProvider]
    const model = settings.llmModels[settings.llmProvider]
    if (!price || (model && model !== price.model)) llm = null
    else {
      const extraOut = (settings.extras.names ? 40 : 0) + (settings.extras.terms ? 30 : 0)
      const extraIn = settings.extras.recall ? 800 : 0
      llm =
        (requestsPerHour * ((INPUT_TOKENS_PER_REQUEST + extraIn) * price.input + (OUTPUT_TOKENS_PER_REQUEST + extraOut) * price.output)) /
        1_000_000
    }
  }

  const total = stt === null || llm === null ? null : stt + llm
  return { stt, llm, total, requestsPerHour }
}

export function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}
