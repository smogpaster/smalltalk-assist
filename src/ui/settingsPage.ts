import { UI_LANGUAGES } from '../i18n'
import type { UiContext } from './context'
import { el, selectField } from './dom'

const LANGUAGE_NAMES: Record<string, string> = { de: 'Deutsch', en: 'English', ja: '日本語' }

/** Milestone-1 settings. Providers, keys and profiles follow in M3–M5. */
export function renderSettings(ctx: UiContext): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()
  const locked = ctx.session.isActive

  return el(
    'div',
    {},
    el('h2', {}, t('ui.nav.settings')),
    el(
      'div',
      { class: 'card' },
      selectField(t('ui.language'), s.uiLanguage, [
        { value: 'auto', label: t('ui.language.auto') },
        ...UI_LANGUAGES.map(code => ({ value: code, label: LANGUAGE_NAMES[code] ?? code })),
      ], value => ctx.settings.update({ uiLanguage: value })),
      locked
        ? el('p', { class: 'dim' }, t('ui.status.recording'))
        : selectField(t('ui.mode'), s.mode, [
            { value: 'demo', label: t('ui.mode.mock') },
            { value: 'live', label: t('ui.mode.live') },
          ], value => ctx.settings.update({ mode: value })),
      selectField(t('ui.demoLanguage'), s.demoLanguage, [
        { value: 'de', label: LANGUAGE_NAMES.de },
        { value: 'en', label: LANGUAGE_NAMES.en },
        { value: 'ja', label: LANGUAGE_NAMES.ja },
      ], value => ctx.settings.update({ demoLanguage: value })),
      selectField(t('ui.perPage'), s.suggestionsPerPage, [
        { value: 1, label: '1' },
        { value: 2, label: '2' },
        { value: 3, label: '3' },
      ], value => ctx.settings.update({ suggestionsPerPage: value })),
    ),
  )
}
