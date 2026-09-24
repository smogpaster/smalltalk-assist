import { de } from './locales/de'
import { en, type MessageKey, type Messages } from './locales/en'
import { ja } from './locales/ja'

export type { MessageKey } from './locales/en'

/** To add a language: create locales/xx.ts typed as `Messages` and register it here. */
const catalogs = { de, en, ja } satisfies Record<string, Messages>

export type UiLanguage = keyof typeof catalogs
export const UI_LANGUAGES = Object.keys(catalogs) as UiLanguage[]

export function isUiLanguage(value: string): value is UiLanguage {
  return value in catalogs
}

/** Picks the best supported language from a preference list such as navigator.languages. */
export function resolveLanguage(preferred: readonly string[], fallback: UiLanguage = 'en'): UiLanguage {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isUiLanguage(primary)) return primary
  }
  return fallback
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

export function createTranslator(language: UiLanguage): Translate {
  const catalog = catalogs[language]
  return (key, params) => {
    const template = catalog[key] ?? en[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    )
  }
}
