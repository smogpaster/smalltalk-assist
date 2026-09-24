import type { SessionSnapshot } from '../app/session'
import { onTrace } from '../diag/trace'
import type { MessageKey } from '../i18n'
import type { UiContext } from './context'
import { renderDiagnostics } from './diagnosticsPage'
import { el } from './dom'
import { renderHome } from './homePage'
import { renderProfile } from './profilePage'
import { renderSettings } from './settingsPage'
import { injectStyles } from './styles'

type Tab = 'home' | 'profile' | 'settings' | 'diagnostics'

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'home', label: 'ui.nav.home' },
  { id: 'profile', label: 'ui.nav.profile' },
  { id: 'settings', label: 'ui.nav.settings' },
  { id: 'diagnostics', label: 'ui.nav.diagnostics' },
]

/** Mounts the phone UI and re-renders it when session or settings change. */
export function mountUi(root: HTMLElement, ctx: UiContext): { refresh(): void } {
  injectStyles()
  let tab: Tab = 'home'
  let snapshot: SessionSnapshot = ctx.session.snapshot()
  let scheduled = false
  let tabChanged = false

  const render = () => {
    scheduled = false
    const t = ctx.t()
    document.documentElement.lang = ctx.settings.get().uiLanguage === 'auto' ? navigator.language : ctx.settings.get().uiLanguage
    const status = statusChip(snapshot, ctx)
    const rerender = () => schedule()
    const page =
      tab === 'home' ? renderHome(ctx, snapshot)
      : tab === 'profile' ? renderProfile(ctx, rerender)
      : tab === 'settings' ? renderSettings(ctx, rerender)
      : renderDiagnostics(ctx, rerender)
    const tabs = el(
      'nav',
      { class: 'tabs' },
      ...TABS.map(item =>
        el('button', { class: item.id === tab ? 'active' : '', on: { click: () => { tabChanged = tab !== item.id; tab = item.id; schedule() } } }, t(item.label)),
      ),
    )
    // Re-rendering replaces the DOM; keep the scroll position so buttons don't jump away.
    const scroll = window.scrollY
    root.replaceChildren(el('header', { class: 'topbar' }, el('h1', {}, t('app.title')), status), page, tabs)
    if (!tabChanged) window.scrollTo(0, scroll)
    tabChanged = false
  }

  // Coalesce bursts (interim transcripts arrive every ~200 ms). Deliberately a
  // timer, not requestAnimationFrame: rAF never fires while the WebView is
  // hidden (simulator window, locked phone), which would freeze the UI state.
  const schedule = (delayMs = 50) => {
    if (scheduled) return
    scheduled = true
    setTimeout(render, delayMs)
  }

  ctx.session.subscribe(next => {
    const phaseChanged = next.phase !== snapshot.phase
    snapshot = next
    // Transcript updates arrive every ~100 ms. Only the conversation page needs
    // them live; diagnostics refreshes slowly (must stay scrollable); pages
    // with text fields re-render only on start/stop so typing is not lost.
    if (tab === 'home') schedule(50)
    else if (tab === 'diagnostics') schedule(1000)
    else if (phaseChanged) schedule()
  })
  ctx.settings.subscribe(() => schedule())
  // The trace changes often; re-render at most once per second so iOS
  // scrolling on the diagnostics page is not interrupted constantly.
  onTrace(() => {
    if (tab === 'diagnostics') schedule(1000)
  })
  render()
  return { refresh: () => schedule() }
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
