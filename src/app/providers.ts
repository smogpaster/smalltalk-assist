import { ProviderError } from '../core/errors'
import { MockLlmProvider } from '../mock/mockLlm'
import { MOCK_SELF_LABEL, MockSttProvider } from '../mock/mockStt'
import type { Settings } from '../settings/schema'
import type { SessionProviders } from './session'

/** Chooses the providers for a session based on the settings. */
export function createProviders(settings: Settings): SessionProviders {
  if (settings.mode === 'demo') {
    return {
      stt: new MockSttProvider(settings.demoLanguage),
      llm: new MockLlmProvider(settings.demoLanguage),
      selfLabel: MOCK_SELF_LABEL,
      needsAudio: false,
    }
  }
  // Real STT (milestone 3) and LLM (milestone 4) adapters plug in here.
  throw new ProviderError('session', 'unsupported', 'Live providers are not configured yet')
}
