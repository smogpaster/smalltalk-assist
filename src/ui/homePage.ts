import type { SessionSnapshot } from '../app/session'
import type { MessageKey } from '../i18n'
import type { UiContext } from './context'
import { el } from './dom'

const MAX_LINES = 40

export function renderHome(ctx: UiContext, s: SessionSnapshot): HTMLElement {
  const t = ctx.t()
  const active = s.phase !== 'idle'
  const view = ctx.glassesView()

  const startStop = el(
    'button',
    {
      class: active ? 'btn danger' : 'btn',
      disabled: s.phase === 'starting',
      on: { click: () => void (active ? ctx.session.stop() : ctx.session.start()) },
    },
    active ? t('ui.stop') : t('ui.start'),
  )

  const quiet = active
    ? el('button', { class: 'btn secondary', on: { click: () => ctx.session.toggleQuiet() } }, t('ui.status.quiet'))
    : null

  const mode = el('p', { class: 'dim' }, s.demo || ctx.settings.get().mode === 'demo' ? t('ui.mode.mock') : t('ui.mode.live'))

  const suggestions = s.suggestions.length
    ? s.suggestions.map(sg =>
        el('div', { class: 'sugg' }, el('span', { class: 'kind' }, t(`ui.kind.${sg.kind}` as MessageKey)), el('span', {}, sg.text)),
      )
    : [el('p', { class: 'dim' }, t('ui.suggestions.empty'))]

  const lines = s.transcript.slice(-MAX_LINES).map(seg =>
    el(
      'div',
      { class: seg.isFinal ? 'line' : 'line interim' },
      el('span', { class: 'who' }, t(`ui.speaker.${seg.speaker}` as MessageKey)),
      seg.text,
    ),
  )

  return el(
    'div',
    {},
    el('div', { class: 'card' }, mode, el('div', { class: 'btn-row' }, startStop, quiet),
      s.error ? el('p', { class: 'error' }, t(`error.${s.error.kind}` as MessageKey)) : null),
    el('h2', {}, t('ui.glassesPreview')),
    el('div', { class: 'glasses', 'aria-label': t('ui.glassesPreview') }, el('div', { class: 'gh' }, view.header), view.body),
    el('h2', {}, t('ui.suggestions')),
    el('div', { class: 'card' }, ...suggestions),
    el('h2', {}, t('ui.transcript')),
    el('div', { class: 'card' }, ...(lines.length ? lines : [el('p', { class: 'dim' }, t('ui.transcript.empty'))])),
  )
}
