import type { UiContext } from './context'
import { el } from './dom'

const state = { checked: false }

/**
 * First-run notes: what the app does, where data goes, informing the other
 * person (neutral legal note, no legal advice). Must be confirmed before the
 * glasses can start a conversation.
 */
export function renderOnboarding(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const section = (title: string, body: string) =>
    el('div', { class: 'card' }, el('p', {}, el('strong', {}, title)), el('p', { class: 'dim', style: 'font-size:15px' }, body))

  return el(
    'div',
    {},
    el('h1', { style: 'margin-bottom:12px' }, t('onboarding.title')),
    el('p', {}, t('onboarding.what')),
    section(t('onboarding.data.title'), t('onboarding.data.body')),
    section(t('onboarding.consent.title'), t('onboarding.consent.body')),
    section(t('onboarding.start.title'), t('onboarding.start.body')),
    el('label', { class: 'toggle' },
      el('input', { type: 'checkbox', checked: state.checked, on: { change: event => { state.checked = (event.target as HTMLInputElement).checked; rerender() } } }),
      el('span', {}, t('onboarding.check')),
    ),
    el('button', {
      class: 'btn',
      disabled: !state.checked,
      on: { click: () => { state.checked = false; ctx.settings.update({ onboardingDone: true }) } },
    }, t('onboarding.continue')),
  )
}
