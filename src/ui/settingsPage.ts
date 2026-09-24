import type { ProviderError } from '../core/errors'
import { toProviderError } from '../core/errors'
import { UI_LANGUAGES, type MessageKey } from '../i18n'
import { maskKey } from '../settings/keys'
import { CONVERSATION_LANGUAGES, LANGUAGE_NATIVE_NAMES, type ConversationLanguage } from '../stt/languages'
import { STT_PROVIDERS, sttProviderInfo, type SttProviderId } from '../stt/registry'
import { trace } from '../diag/trace'
import type { UiContext } from './context'
import { el, selectField } from './dom'

const UI_LANGUAGE_NAMES: Record<string, string> = { de: 'Deutsch', en: 'English', ja: '日本語' }

/** Survives re-renders; never persisted. Key drafts are cleared after saving. */
const state = {
  keyDraft: {} as Partial<Record<SttProviderId, string>>,
  test: {} as Partial<Record<SttProviderId, 'pending' | 'ok' | ProviderError>>,
  showAdvanced: false,
}

export function renderSettings(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()
  const locked = ctx.session.isActive
  const provider = sttProviderInfo(s.sttProvider)

  // ---- Conversation --------------------------------------------------------
  const languageOptions: { value: ConversationLanguage | 'auto'; label: string }[] = []
  if (!provider || provider.capabilities.autoDetect) languageOptions.push({ value: 'auto', label: t('settings.language.auto') })
  for (const code of CONVERSATION_LANGUAGES) {
    if (!provider || provider.capabilities.languages.includes(code)) languageOptions.push({ value: code, label: LANGUAGE_NATIVE_NAMES[code] })
  }
  const languageSupported = languageOptions.some(o => o.value === s.conversationLanguage)

  const conversation = el(
    'div',
    { class: 'card' },
    locked ? el('p', { class: 'dim' }, t('settings.lockedWhileRecording')) : null,
    selectField(t('ui.mode'), s.mode, [
      { value: 'demo', label: t('ui.mode.mock') },
      { value: 'live', label: t('ui.mode.live') },
    ], value => ctx.settings.update({ mode: value }), locked),
    s.mode === 'demo'
      ? selectField(t('ui.demoLanguage'), s.demoLanguage, [
          { value: 'de', label: 'Deutsch' },
          { value: 'en', label: 'English' },
          { value: 'ja', label: '日本語' },
        ], value => ctx.settings.update({ demoLanguage: value }), locked)
      : null,
    s.mode === 'live'
      ? selectField(t('settings.conversationLanguage'), languageSupported ? s.conversationLanguage : languageOptions[0]?.value ?? 'de',
          languageOptions, value => ctx.settings.update({ conversationLanguage: value }), locked)
      : null,
    s.mode === 'live' && !languageSupported ? el('p', { class: 'error' }, t('settings.languageUnsupported')) : null,
    s.mode === 'live'
      ? selectField(t('settings.mic'), s.micSource, [
          { value: 'glasses', label: t('settings.mic.glasses') },
          { value: 'phone', label: t('settings.mic.phone') },
        ], value => ctx.settings.update({ micSource: value }), locked)
      : null,
    selectField(t('ui.perPage'), s.suggestionsPerPage, [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
    ], value => ctx.settings.update({ suggestionsPerPage: value })),
  )

  // ---- Speech recognition ------------------------------------------------------
  const stt = el(
    'div',
    { class: 'card' },
    el('p', { class: 'dim' }, t('settings.stt.intro')),
    selectField(t('settings.stt.provider'), s.sttProvider ?? '', [
      { value: '', label: t('settings.stt.none') },
      ...STT_PROVIDERS.map(p => ({ value: p.id, label: p.name })),
    ], value => ctx.settings.update({ sttProvider: value === '' ? null : (value as SttProviderId) }), locked),
    provider ? providerDetails(ctx, provider.id, rerender) : null,
  )

  // ---- App ----------------------------------------------------------------------
  const app = el(
    'div',
    { class: 'card' },
    selectField(t('ui.language'), s.uiLanguage, [
      { value: 'auto', label: t('ui.language.auto') },
      ...UI_LANGUAGES.map(code => ({ value: code, label: UI_LANGUAGE_NAMES[code] ?? code })),
    ], value => ctx.settings.update({ uiLanguage: value })),
  )

  return el(
    'div',
    {},
    el('h2', {}, t('settings.section.conversation')),
    conversation,
    el('h2', {}, t('settings.section.stt')),
    stt,
    el('h2', {}, t('settings.section.app')),
    app,
  )
}

function providerDetails(ctx: UiContext, id: SttProviderId, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()
  const info = sttProviderInfo(id)!
  const caps = info.capabilities
  const stored = ctx.keys.get(id)
  const locked = ctx.session.isActive
  const test = state.test[id]

  const input = el('input', {
    type: 'password',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: stored ? maskKey(stored) : t('settings.key.placeholder'),
    value: state.keyDraft[id] ?? '',
    on: { input: event => (state.keyDraft[id] = (event.target as HTMLInputElement).value) },
  })

  const save = async () => {
    const draft = state.keyDraft[id]?.trim()
    if (!draft) return
    await ctx.keys.set(id, draft)
    state.keyDraft[id] = ''
    delete state.test[id]
    rerender()
  }
  const remove = async () => {
    await ctx.keys.remove(id)
    delete state.test[id]
    rerender()
  }
  const runTest = async () => {
    const key = ctx.keys.get(id)
    if (!key) return
    state.test[id] = 'pending'
    rerender()
    try {
      await info.create(key, s.sttModels[id]).testConnection()
      state.test[id] = 'ok'
    } catch (err) {
      const error = toProviderError(id, err)
      state.test[id] = error
      // Error messages come from fetch/WebKit or the provider – never the key.
      trace('settings', 'connection test failed', { provider: id, kind: error.kind, status: error.status ?? null, message: error.message.slice(0, 120) })
    }
    rerender()
  }

  const chips = [
    caps.diarization ? t('settings.cap.diarization') : t('settings.cap.noDiarization'),
    caps.autoDetect ? t('settings.cap.autoDetect') : t('settings.cap.fixedLanguage'),
  ].join(' · ')

  return el(
    'div',
    {},
    el('p', { class: 'dim' }, chips),
    el('label', { class: 'field' },
      el('span', { class: 'field-label' }, t('settings.key.label', { provider: info.name })),
      input,
    ),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn secondary', on: { click: () => void save() } }, t('settings.key.save')),
      stored ? el('button', { class: 'btn secondary', on: { click: () => void remove() } }, t('settings.key.remove')) : null,
    ),
    el('p', { class: 'dim' }, t('settings.key.where'), ' ', el('a', { href: info.keyUrl, target: '_blank', rel: 'noopener' }, info.keyUrl)),
    el('p', { class: 'dim' }, t('settings.key.privacy')),
    el('button', { class: 'btn', disabled: !stored || test === 'pending', on: { click: () => void runTest() } },
      test === 'pending' ? t('diag.pending') : t('settings.key.test')),
    test && test !== 'pending'
      ? test === 'ok'
        ? el('p', { class: 'ok' }, `✔ ${t('settings.key.ok')}`)
        : el('div', {},
            el('p', { class: 'error' }, `✘ ${t(`error.${test.kind}` as MessageKey)}`, test.status ? ` (HTTP ${test.status})` : ''),
            el('p', { class: 'dim' }, test.message.slice(0, 160)),
          )
      : null,
    caps.diarization
      ? toggleField(t('settings.diarization'), s.diarization, value => ctx.settings.update({ diarization: value }), locked)
      : el('p', { class: 'dim' }, t('settings.noDiarizationHint')),
    el('button', { class: 'btn secondary', on: { click: () => { state.showAdvanced = !state.showAdvanced; rerender() } } },
      state.showAdvanced ? t('settings.advanced.hide') : t('settings.advanced.show')),
    state.showAdvanced
      ? el('label', { class: 'field' },
          el('span', { class: 'field-label' }, t('settings.model')),
          el('input', {
            type: 'text',
            autocapitalize: 'off',
            spellcheck: 'false',
            placeholder: info.defaultModel,
            value: s.sttModels[id] ?? '',
            disabled: locked,
            on: { change: event => ctx.settings.update({ sttModels: { ...s.sttModels, [id]: (event.target as HTMLInputElement).value } }) },
          }),
        )
      : null,
  )
}

function toggleField(label: string, value: boolean, onChange: (value: boolean) => void, disabled = false): HTMLElement {
  return el('label', { class: 'toggle' },
    el('input', { type: 'checkbox', checked: value, disabled, on: { change: event => onChange((event.target as HTMLInputElement).checked) } }),
    el('span', {}, label),
  )
}
