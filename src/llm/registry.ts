import { ANTHROPIC_DEFAULT_MODEL, AnthropicProvider } from './providers/anthropic'
import { GEMINI_DEFAULT_MODEL, GeminiProvider } from './providers/gemini'
import { OpenAiCompatibleProvider } from './providers/openaiCompatible'
import type { LlmProvider } from './types'

export type LlmProviderId =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'mistral'
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'cerebras'
  | 'fireworks'
  | 'xai'

export interface LlmProviderInfo {
  id: LlmProviderId
  name: string
  /** Default model, or null when the user must pick one from the loaded list. */
  defaultModel: string | null
  keyUrl: string
  /** Origins the app talks to – must all be in the app.json network whitelist. */
  origins: readonly string[]
  /** OpenAI-compatible preset (shown in its own group). */
  compatible: boolean
  create(apiKey: string, model: string): LlmProvider
}

/**
 * OpenAI-compatible hosts. A free-form base URL is not possible in a
 * published app: the Even Hub network whitelist is fixed at pack time, so
 * only these preset origins can be reached (all checked for CORS).
 */
function compatible(id: LlmProviderId, name: string, baseUrl: string, keyUrl: string): LlmProviderInfo {
  return {
    id,
    name,
    defaultModel: null,
    keyUrl,
    origins: [new URL(baseUrl).origin],
    compatible: true,
    create: (apiKey, model) => new OpenAiCompatibleProvider({ id, baseUrl, apiKey, model }),
  }
}

export const LLM_PROVIDERS: readonly LlmProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    defaultModel: ANTHROPIC_DEFAULT_MODEL,
    keyUrl: 'https://console.anthropic.com',
    origins: ['https://api.anthropic.com'],
    compatible: false,
    create: (apiKey, model) => new AnthropicProvider(apiKey, model),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-6-luna',
    keyUrl: 'https://platform.openai.com/api-keys',
    origins: ['https://api.openai.com'],
    compatible: false,
    create: (apiKey, model) =>
      new OpenAiCompatibleProvider({ id: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey, model, maxTokensField: 'max_completion_tokens', minMaxTokens: 2048, sendTemperature: false }),
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: GEMINI_DEFAULT_MODEL,
    keyUrl: 'https://aistudio.google.com/apikey',
    origins: ['https://generativelanguage.googleapis.com'],
    compatible: false,
    create: (apiKey, model) => new GeminiProvider(apiKey, model),
  },
  {
    id: 'mistral',
    name: 'Mistral',
    defaultModel: 'mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    origins: ['https://api.mistral.ai'],
    compatible: false,
    create: (apiKey, model) => new OpenAiCompatibleProvider({ id: 'mistral', baseUrl: 'https://api.mistral.ai/v1', apiKey, model }),
  },
  compatible('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/keys'),
  compatible('groq', 'Groq', 'https://api.groq.com/openai/v1', 'https://console.groq.com/keys'),
  compatible('together', 'Together AI', 'https://api.together.xyz/v1', 'https://api.together.ai/settings/api-keys'),
  compatible('deepseek', 'DeepSeek', 'https://api.deepseek.com', 'https://platform.deepseek.com/api_keys'),
  compatible('cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', 'https://cloud.cerebras.ai'),
  compatible('fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'https://fireworks.ai/account/api-keys'),
  compatible('xai', 'xAI (Grok)', 'https://api.x.ai/v1', 'https://console.x.ai'),
]

export function llmProviderInfo(id: string | null | undefined): LlmProviderInfo | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}

export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return LLM_PROVIDERS.some(p => p.id === value)
}
