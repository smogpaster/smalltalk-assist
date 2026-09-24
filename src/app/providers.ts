import { ProviderError } from '../core/errors'
import { MockLlmProvider } from '../mock/mockLlm'
import { MOCK_SELF_LABEL, MockSttProvider } from '../mock/mockStt'
import type { KeyStore } from '../settings/keys'
import type { Settings } from '../settings/schema'
import { sttProviderInfo } from '../stt/registry'
import type { SessionProviders } from './session'

/** Chooses the providers for a session based on settings and stored keys. */
export function createProvidersFactory(keys: Pick<KeyStore, 'get'>) {
  return (settings: Settings): SessionProviders => {
    if (settings.mode === 'demo') {
      return {
        stt: new MockSttProvider(settings.demoLanguage),
        llm: new MockLlmProvider(settings.demoLanguage),
        selfLabel: MOCK_SELF_LABEL,
        needsAudio: false,
        language: settings.demoLanguage,
        diarization: true,
      }
    }

    const info = sttProviderInfo(settings.sttProvider)
    if (!info) throw new ProviderError('session', 'not_configured', 'No speech provider selected')
    const key = keys.get(info.id)
    if (!key) throw new ProviderError(info.id, 'not_configured', 'API key missing')

    const language = settings.conversationLanguage
    const supported = language === 'auto' ? info.capabilities.autoDetect : info.capabilities.languages.includes(language)
    if (!supported) throw new ProviderError(info.id, 'unsupported', `Language ${language} not supported`)

    return {
      stt: info.create(key, settings.sttModels[info.id]),
      // LLM adapters arrive in milestone 4; until then live mode shows the transcript.
      llm: null,
      needsAudio: true,
      language,
      diarization: settings.diarization && info.capabilities.diarization,
    }
  }
}
