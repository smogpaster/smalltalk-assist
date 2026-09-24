import type { SessionSnapshot } from '../app/session'
import { onTrace } from '../diag/trace'
import type { MessageKey } from '../i18n'
import type { UiContext } from './context'
import { renderDiagnostics } from './diagnosticsPage'
import { el } from './dom'
import { renderHome } from './homePage'
import { renderSettings } from './settingsPage'
import { injectStyles } from './styles'

type Tab = 'home' | 'settings' | 'diagnostics'

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'home', label: 'ui.nav.home' },
  { id: 'settings', label: 'ui.nav.settings' },
  { id: 'diagnostics', label: 'ui.nav.diagnostics' },
]

/** Mounts the phone UI and re-renders it when session or settings change. */
export function mountUi(root: HTMLElement, ctx: UiContext): { refresh(): void } {
  injectStyles()
  let tab: Tab = 'home'
  let snapshot: SessionSnapshot = ctx.session.snapshot()
  let scheduled = false

  const render = () => {
    scheduled = false
    const t = ctx.t()
    document.documentElement.lang = ctx.settings.get().uiLanguage === 'auto' ? navigator.language : ctx.settings.get().uiLanguage
    const status = statusChip(snapshot, ctx)
    const page =
      tab === 'home' ? renderHome(ctx, snapshot) : tab === 'settings' ? renderSettings(ctx, schedule) : renderDiagnostics(ctx, schedule)
    const tabs = el(
      'nav',
      { class: 'tabs' },
      ...TABS.map(item =>
        el('button', { class: item.id === tab ? 'active' : '', on: { click: () => { tab = item.id; schedule() } } }, t(item.label)),
      ),
    )
    root.replaceChildren(el('header', { class: 'topbar' }, el('h1', {}, t('app.title')), status), page, tabs)
  }

  // Coalesce bursts (interim transcripts arrive every ~200 ms). Deliberately a
  // timer, not requestAnimationFrame: rAF never fires while the WebView is
  // hidden (simulator window, locked phone), which would freeze the UI state.
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    setTimeout(render, 50)
  }

  ctx.session.subscribe(next => {
    snapshot = next
    schedule()
  })
  ctx.settings.subscribe(schedule)
  onTrace(() => {
    if (tab === 'diagnostics') schedule()
  })
  render()
  return { refresh: schedule }
}

function statusChip(s: SessionSnapshot, ctx: UiContext): HTMLElement {
  const t = ctx.t()
  if (!ctx.inEvenApp && s.phase === 'idle') return el('span', { class: 'chip' }, t('ui.status.noGlasses'))
  const label =
    s.phase === 'recording' ? t('ui.status.recording')
    : s.phase === 'quiet' ? t('ui.status.quiet')
    : s.phase === 'starting' ? t('ui.status.starting')
    : t('ui.status.idle')
  return el('span', { class: s.phase === 'recording' ? 'chip rec' : 'chip' }, label)
}
