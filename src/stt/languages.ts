/** Conversation languages the app offers; each STT provider supports a subset. */
export const CONVERSATION_LANGUAGES = ['de', 'en', 'ja', 'fr', 'es', 'it', 'nl', 'pt', 'zh', 'ko'] as const
export type ConversationLanguage = (typeof CONVERSATION_LANGUAGES)[number]

/** Shown in the language picker in the language's own name. */
export const LANGUAGE_NATIVE_NAMES: Record<ConversationLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
  zh: '中文',
  ko: '한국어',
}

export function isConversationLanguage(value: unknown): value is ConversationLanguage {
  return typeof value === 'string' && (CONVERSATION_LANGUAGES as readonly string[]).includes(value)
}
