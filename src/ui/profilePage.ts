import type { MessageKey } from '../i18n'
import { FIELD_MAX, NAME_MAX, TONES, type OtherPerson, type Profile } from '../profiles/model'
import type { UiContext } from './context'
import { el, selectField } from './dom'

/** Survives re-renders; never persisted. */
const state = { deleteArmed: false }

/**
 * Profiles and the conversation partner. Text fields save as you type and do
 * not trigger a re-render (that would drop the keyboard focus); only
 * structural actions (switch, create, delete) re-render the page.
 */
export function renderProfile(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()
  const store = ctx.profiles
  const profile = store.active()
  const person = store.person()

  const profileSelect = selectField(t('profile.active'), profile.id,
    store.list().map(p => ({ value: p.id, label: p.name || '…' })),
    id => {
      store.setActive(id)
      state.deleteArmed = false
      rerender()
    })

  const create = () => {
    store.create(t('profile.newName'))
    state.deleteArmed = false
    rerender()
  }
  const remove = () => {
    if (!state.deleteArmed) {
      state.deleteArmed = true
      rerender()
      return
    }
    store.remove(profile.id)
    state.deleteArmed = false
    rerender()
  }

  const update = (patch: Partial<Omit<Profile, 'id'>>) => store.update(profile.id, patch)
  const updatePerson = (patch: Partial<OtherPerson>) => store.updatePerson(patch)

  return el(
    'div',
    {},
    el('h2', {}, t('profile.section.profile')),
    el('div', { class: 'card' },
      el('p', { class: 'dim' }, t('profile.intro')),
      profileSelect,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn secondary', on: { click: create } }, t('profile.new')),
        store.list().length > 1
          ? el('button', { class: state.deleteArmed ? 'btn danger' : 'btn secondary', on: { click: remove } },
              state.deleteArmed ? t('profile.deleteConfirm') : t('profile.delete'))
          : null,
      ),
      el('div', { style: 'height:12px' }),
      input(t('profile.name'), profile.name, NAME_MAX, value => update({ name: value })),
      selectField(t('profile.tone'), profile.tone,
        TONES.map(tone => ({ value: tone, label: t(`profile.tone.${tone}` as MessageKey) })),
        value => update({ tone: value })),
      textarea(t('profile.aboutMe'), t('profile.aboutMe.hint'), profile.aboutMe, value => update({ aboutMe: value })),
      textarea(t('profile.avoid'), t('profile.avoid.hint'), profile.avoidTopics, value => update({ avoidTopics: value })),
      textarea(t('profile.goal'), t('profile.goal.hint'), profile.goal, value => update({ goal: value }), 2),
    ),

    el('h2', {}, t('profile.section.person')),
    el('div', { class: 'card' },
      el('p', { class: 'dim' }, t('profile.person.intro')),
      input(t('profile.person.name'), person.name, NAME_MAX, value => updatePerson({ name: value })),
      input(t('profile.person.relation'), person.relation, FIELD_MAX, value => updatePerson({ relation: value }), t('profile.person.relation.hint')),
      textarea(t('profile.person.interests'), '', person.interests, value => updatePerson({ interests: value }), 2),
      textarea(t('profile.person.mutual'), '', person.mutualAcquaintances, value => updatePerson({ mutualAcquaintances: value }), 2),
      textarea(t('profile.person.bringUp'), '', person.bringUp, value => updatePerson({ bringUp: value }), 2),
      textarea(t('profile.person.avoid'), '', person.avoid, value => updatePerson({ avoid: value }), 2),
      el('button', { class: 'btn secondary', on: { click: () => { store.clearPerson(); rerender() } } }, t('profile.person.clear')),
      el('p', { class: 'dim', style: 'margin-top:8px' }, t('profile.person.privacy')),
    ),
  )
}

function input(label: string, value: string, maxLength: number, onInput: (value: string) => void, placeholder = ''): HTMLElement {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label' }, label),
    el('input', {
      type: 'text',
      value,
      maxLength,
      placeholder,
      on: { input: event => onInput((event.target as HTMLInputElement).value) },
    }),
  )
}

function textarea(label: string, hint: string, value: string, onInput: (value: string) => void, rows = 3): HTMLElement {
  const area = el('textarea', {
    rows,
    maxLength: FIELD_MAX,
    placeholder: hint,
    on: { input: event => onInput((event.target as HTMLTextAreaElement).value) },
  })
  area.value = value
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), area)
}
