import type { ProviderError } from '../core/errors'
import { toProviderError } from '../core/errors'
import { trace } from '../diag/trace'
import { UI_LANGUAGES, type MessageKey } from '../i18n'
import { LLM_PROVIDERS, llmProviderInfo, type LlmProviderId } from '../llm/registry'
import { maskKey } from '../settings/keys'
import type { Settings } from '../settings/schema'
import { CONVERSATION_LANGUAGES, LANGUAGE_NATIVE_NAMES, type ConversationLanguage } from '../stt/languages'
import { STT_PROVIDERS, sttProviderInfo, type SttProviderId } from '../stt/registry'
import type { UiContext } from './context'
import { el, selectField } from './dom'

const UI_LANGUAGE_NAMES: Record<string, string> = { de: 'Deutsch', en: 'English', ja: '日本語' }

type TestState = 'pending' | 'ok' | ProviderError

/** Survives re-renders; never persisted. Key drafts are cleared after saving. */
const state = {
  keyDraft: {} as Record<string, string>,
  test: {} as Record<string, TestState>,
  models: {} as Record<string, string[] | 'pending' | ProviderError>,
  showAdvancedStt: false,
}

export function renderSettings(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()

  return el(
    'div',
    {},
    el('h2', {}, t('settings.section.conversation')),
    conversationCard(ctx),
    el('h2', {}, t('settings.section.stt')),
    sttCard(ctx, rerender),
    el('h2', {}, t('settings.section.llm')),
    llmCard(ctx, rerender),
    el('h2', {}, t('settings.section.app')),
    el(
      'div',
      { class: 'card' },
      selectField(t('ui.language'), s.uiLanguage, [
        { value: 'auto', label: t('ui.language.auto') },
        ...UI_LANGUAGES.map(code => ({ value: code, label: UI_LANGUAGE_NAMES[code] ?? code })),
      ], value => ctx.settings.update({ uiLanguage: value })),
    ),
  )
}

// ---- Conversation --------------------------------------------------------------

function conversationCard(ctx: UiContext): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()
  const locked = ctx.session.isActive
  const provider = sttProviderInfo(s.sttProvider)

  const languageOptions: { value: ConversationLanguage | 'auto'; label: string }[] = []
  if (!provider || provider.capabilities.autoDetect) languageOptions.push({ value: 'auto', label: t('settings.language.auto') })
  for (const code of CONVERSATION_LANGUAGES) {
    if (!provider || provider.capabilities.languages.includes(code)) languageOptions.push({ value: code, label: LANGUAGE_NATIVE_NAMES[code] })
  }
  const languageSupported = languageOptions.some(o => o.value === s.conversationLanguage)
  const live = s.mode === 'live'

  return el(
    'div',
    { class: 'card' },
    locked ? el('p', { class: 'dim' }, t('settings.lockedWhileRecording')) : null,
    selectField(t('ui.mode'), s.mode, [
      { value: 'demo', label: t('ui.mode.mock') },
      { value: 'live', label: t('ui.mode.live') },
    ], value => ctx.settings.update({ mode: value }), locked),
    !live
      ? selectField(t('ui.demoLanguage'), s.demoLanguage, [
          { value: 'de', label: 'Deutsch' },
          { value: 'en', label: 'English' },
          { value: 'ja', label: '日本語' },
        ], value => ctx.settings.update({ demoLanguage: value }), locked)
      : null,
    live
      ? selectField(t('settings.conversationLanguage'), languageSupported ? s.conversationLanguage : languageOptions[0]?.value ?? 'de',
          languageOptions, value => ctx.settings.update({ conversationLanguage: value }), locked)
      : null,
    live && !languageSupported ? el('p', { class: 'error' }, t('settings.languageUnsupported')) : null,
    live
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
}

// ---- Speech recognition ----------------------------------------------------------

function sttCard(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()
  const locked = ctx.session.isActive
  const info = sttProviderInfo(s.sttProvider)

  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'dim' }, t('settings.stt.intro')),
    selectField(t('settings.stt.provider'), s.sttProvider ?? '', [
      { value: '', label: t('settings.stt.none') },
      ...STT_PROVIDERS.map(p => ({ value: p.id, label: p.name })),
    ], value => ctx.settings.update({ sttProvider: value === '' ? null : (value as SttProviderId) }), locked),
    info
      ? el(
          'div',
          {},
          el('p', { class: 'dim' }, [
            info.capabilities.diarization ? t('settings.cap.diarization') : t('settings.cap.noDiarization'),
            info.capabilities.autoDetect ? t('settings.cap.autoDetect') : t('settings.cap.fixedLanguage'),
          ].join(' · ')),
          keyBlock(ctx, rerender, {
            id: info.id,
            name: info.name,
            keyUrl: info.keyUrl,
            test: key => info.create(key, s.sttModels[info.id]).testConnection(),
          }),
          info.capabilities.diarization
            ? toggleField(t('settings.diarization'), s.diarization, value => ctx.settings.update({ diarization: value }), locked)
            : el('p', { class: 'dim' }, t('settings.noDiarizationHint')),
          el('button', { class: 'btn secondary', on: { click: () => { state.showAdvancedStt = !state.showAdvancedStt; rerender() } } },
            state.showAdvancedStt ? t('settings.advanced.hide') : t('settings.advanced.show')),
          state.showAdvancedStt
            ? textField(t('settings.model'), s.sttModels[info.id] ?? '', info.defaultModel, locked,
                value => ctx.settings.update({ sttModels: { ...s.sttModels, [info.id]: value } }))
            : null,
        )
      : null,
  )
}

// ---- AI suggestions --------------------------------------------------------------

function llmCard(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const s = ctx.settings.get()
  const locked = ctx.session.isActive
  const info = llmProviderInfo(s.llmProvider)
  const model = info ? s.llmModels[info.id] || info.defaultModel || '' : ''
  const setModel = (id: LlmProviderId, value: string) => ctx.settings.update({ llmModels: { ...s.llmModels, [id]: value } })

  const providerOptions = [
    { value: '', label: t('settings.llm.none') },
    ...LLM_PROVIDERS.filter(p => !p.compatible).map(p => ({ value: p.id, label: p.name })),
    ...LLM_PROVIDERS.filter(p => p.compatible).map(p => ({ value: p.id, label: `${p.name} (${t('settings.llm.compatible')})` })),
  ]

  let modelSection: HTMLElement | null = null
  if (info) {
    const listed = state.models[info.id]
    const loadModels = async () => {
      const key = ctx.keys.get(info.id)
      if (!key) return
      state.models[info.id] = 'pending'
      rerender()
      try {
        const provider = info.create(key, model || 'unused')
        state.models[info.id] = (await provider.listModels?.()) ?? []
      } catch (err) {
        state.models[info.id] = toProviderError(info.id, err)
      }
      rerender()
    }
    modelSection = el(
      'div',
      {},
      Array.isArray(listed) && listed.length
        ? selectField(t('settings.llm.model'), listed.includes(model) ? model : '', [
            ...(listed.includes(model) ? [] : [{ value: '', label: model || t('settings.llm.pickModel') }]),
            ...listed.map(m => ({ value: m, label: m })),
          ], value => value && setModel(info.id, value), locked)
        : textField(t('settings.llm.model'), s.llmModels[info.id] ?? '', info.defaultModel ?? t('settings.llm.pickModel'), locked,
            value => setModel(info.id, value)),
      el('button', { class: 'btn secondary', disabled: !ctx.keys.get(info.id) || listed === 'pending', on: { click: () => void loadModels() } },
        listed === 'pending' ? t('diag.pending') : t('settings.llm.loadModels')),
      listed && typeof listed === 'object' && !Array.isArray(listed)
        ? el('p', { class: 'error' }, t(`error.${listed.kind}` as MessageKey))
        : null,
      !info.defaultModel && !s.llmModels[info.id] ? el('p', { class: 'dim' }, t('settings.llm.needsModel')) : null,
    )
  }

  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'dim' }, t('settings.llm.intro')),
    selectField(t('settings.llm.provider'), s.llmProvider ?? '', providerOptions,
      value => ctx.settings.update({ llmProvider: value === '' ? null : (value as LlmProviderId) }), locked),
    info
      ? el(
          'div',
          {},
          keyBlock(ctx, rerender, {
            id: info.id,
            name: info.name,
            keyUrl: info.keyUrl,
            test: key => {
              if (!model) throw new Error(t('settings.llm.needsModel'))
              return info.create(key, model).testConnection()
            },
          }),
          modelSection,
        )
      : el('p', { class: 'dim' }, t('settings.llm.noneHint')),
    selectField(t('settings.suggestionLanguage'), s.suggestionLanguage, [
      { value: 'same', label: t('settings.suggestionLanguage.same') },
      ...CONVERSATION_LANGUAGES.map(code => ({ value: code, label: LANGUAGE_NATIVE_NAMES[code] })),
    ], value => ctx.settings.update({ suggestionLanguage: value as Settings['suggestionLanguage'] })),
    el('p', { class: 'field-label' }, t('settings.pace.title')),
    selectField(t('settings.pace.pause'), s.pauseMs, [
      { value: 500, label: '0,5 s' },
      { value: 900, label: '0,9 s' },
      { value: 1500, label: '1,5 s' },
      { value: 2500, label: '2,5 s' },
    ], value => ctx.settings.update({ pauseMs: value })),
    selectField(t('settings.pace.interval'), s.minIntervalSec, [
      { value: 3, label: '3 s' },
      { value: 6, label: '6 s' },
      { value: 10, label: '10 s' },
      { value: 20, label: '20 s' },
    ], value => ctx.settings.update({ minIntervalSec: value })),
    selectField(t('settings.pace.perMinute'), s.maxPerMinute, [
      { value: 3, label: '3' },
      { value: 6, label: '6' },
      { value: 10, label: '10' },
    ], value => ctx.settings.update({ maxPerMinute: value })),
  )
}

// ---- Shared pieces ---------------------------------------------------------------

interface KeyBlockOptions {
  id: string
  name: string
  keyUrl: string
  /** Runs a real, minimal request with the stored key. */
  test(key: string): Promise<void>
}

/** Key input (masked), save/remove, where to get one, and "Test connection". */
function keyBlock(ctx: UiContext, rerender: () => void, options: KeyBlockOptions): HTMLElement {
  const t = ctx.t()
  const { id } = options
  const stored = ctx.keys.get(id)
  const test = state.test[id]

  const save = async () => {
    const draft = state.keyDraft[id]?.trim()
    if (!draft) return
    await ctx.keys.set(id, draft)
    state.keyDraft[id] = ''
    delete state.test[id]
    delete state.models[id]
    rerender()
  }
  const remove = async () => {
    await ctx.keys.remove(id)
    delete state.test[id]
    delete state.models[id]
    rerender()
  }
  const runTest = async () => {
    const key = ctx.keys.get(id)
    if (!key) return
    state.test[id] = 'pending'
    rerender()
    try {
      await options.test(key)
      state.test[id] = 'ok'
    } catch (err) {
      const error = toProviderError(id, err)
      state.test[id] = error
      // Error messages come from fetch/WebKit or the provider – never the key.
      trace('settings', 'connection test failed', { provider: id, kind: error.kind, status: error.status ?? null, message: error.message.slice(0, 120) })
    }
    rerender()
  }

  return el(
    'div',
    {},
    el('label', { class: 'field' },
      el('span', { class: 'field-label' }, t('settings.key.label', { provider: options.name })),
      el('input', {
        type: 'password',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        placeholder: stored ? maskKey(stored) : t('settings.key.placeholder'),
        value: state.keyDraft[id] ?? '',
        on: { input: event => (state.keyDraft[id] = (event.target as HTMLInputElement).value) },
      }),
    ),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn secondary', on: { click: () => void save() } }, t('settings.key.save')),
      stored ? el('button', { class: 'btn secondary', on: { click: () => void remove() } }, t('settings.key.remove')) : null,
    ),
    el('p', { class: 'dim' }, t('settings.key.where'), ' ', el('a', { href: options.keyUrl, target: '_blank', rel: 'noopener' }, options.keyUrl)),
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
  )
}

function textField(label: string, value: string, placeholder: string, disabled: boolean, onChange: (value: string) => void): HTMLElement {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label' }, label),
    el('input', {
      type: 'text',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder,
      value,
      disabled,
      on: { change: event => onChange((event.target as HTMLInputElement).value) },
    }),
  )
}

function toggleField(label: string, value: boolean, onChange: (value: boolean) => void, disabled = false): HTMLElement {
  return el('label', { class: 'toggle' },
    el('input', { type: 'checkbox', checked: value, disabled, on: { change: event => onChange((event.target as HTMLInputElement).checked) } }),
    el('span', {}, label),
  )
}
