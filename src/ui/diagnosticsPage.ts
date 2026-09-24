import { GLYPH_SAMPLES, checkFetch, checkFetchWithAuth, checkWebSocket, countFrameStats, type CheckResult } from '../diag/checks'
import { clearTrace, previousRunTraces, traceEntries } from '../diag/trace'
import type { UiContext } from './context'
import { el } from './dom'

interface MicStats {
  running: boolean
  frames: number
  bytes: number
  roles: Record<string, number>
  directions: Set<number>
  rms: number
  startedAt: number
}

/** Survives page re-renders; nothing here is persisted. */
const state = {
  ws: null as CheckResult | 'pending' | null,
  fetch: null as CheckResult | 'pending' | null,
  fetchAuth: null as CheckResult | 'pending' | null,
  mic: { running: false, frames: 0, bytes: 0, roles: {}, directions: new Set<number>(), rms: 0, startedAt: 0 } as MicStats,
  glyphsShown: false,
  copied: false,
}

export function renderDiagnostics(ctx: UiContext, rerender: () => void): HTMLElement {
  const t = ctx.t()

  const run = async (key: 'ws' | 'fetch') => {
    state[key] = 'pending'
    if (key === 'fetch') state.fetchAuth = 'pending'
    rerender()
    if (key === 'ws') state.ws = await checkWebSocket()
    else {
      state.fetch = await checkFetch()
      state.fetchAuth = await checkFetchWithAuth()
    }
    rerender()
  }

  const toggleMic = async () => {
    if (!ctx.audio) return
    if (state.mic.running) {
      await ctx.audio.stop()
      state.mic.running = false
      rerender()
      return
    }
    state.mic = { running: true, frames: 0, bytes: 0, roles: {}, directions: new Set(), rms: 0, startedAt: Date.now() }
    let lastPaint = 0
    const ok = await ctx.audio.start(ctx.settings.get().micSource, frame => {
      const m = state.mic
      m.frames++
      m.bytes += frame.pcm.byteLength
      m.roles[frame.speakerRole] = (m.roles[frame.speakerRole] ?? 0) + 1
      if (frame.direction !== null && m.directions.size < 50) m.directions.add(frame.direction)
      m.rms = countFrameStats(frame.pcm).rms
      if (Date.now() - lastPaint > 500) {
        lastPaint = Date.now()
        rerender()
      }
    })
    if (!ok) state.mic.running = false
    rerender()
  }

  const toggleGlyphs = () => {
    state.glyphsShown = !state.glyphsShown
    ctx.showOnGlasses(state.glyphsShown ? GLYPH_SAMPLES.join('\n') : null)
    rerender()
  }

  const copyReport = async () => {
    state.copied = await copyText(report(ctx))
    rerender()
  }

  const m = state.mic
  const seconds = m.running ? Math.max(1, (Date.now() - m.startedAt) / 1000) : 0

  return el(
    'div',
    {},
    el('h2', {}, t('ui.nav.diagnostics')),
    el('p', { class: 'dim' }, t('diag.intro')),

    el('div', { class: 'card' },
      el('p', {}, el('strong', {}, t('diag.ws.title'))),
      el('p', { class: 'dim' }, t('diag.ws.desc')),
      el('button', { class: 'btn secondary', on: { click: () => void run('ws') } }, t('diag.ws.run')),
      resultView(state.ws, t('diag.pending')),
    ),

    el('div', { class: 'card' },
      el('p', {}, el('strong', {}, t('diag.fetch.title'))),
      el('button', { class: 'btn secondary', on: { click: () => void run('fetch') } }, t('diag.fetch.run')),
      resultView(state.fetch, t('diag.pending')),
      resultView(state.fetchAuth, t('diag.pending')),
    ),

    el('div', { class: 'card' },
      el('p', {}, el('strong', {}, t('diag.audio.title'))),
      el('p', { class: 'dim' }, t('diag.audio.desc')),
      el('button', { class: 'btn secondary', disabled: !ctx.audio || ctx.session.isActive, on: { click: () => void toggleMic() } },
        m.running ? t('diag.audio.stop') : t('diag.audio.start')),
      m.frames > 0 || m.running
        ? el('div', { class: 'stats' },
            el('span', {}, 'frames'), el('span', {}, `${m.frames}${m.running ? ` (${(m.frames / seconds).toFixed(1)}/s)` : ''}`),
            el('span', {}, 'bytes/frame'), el('span', {}, m.frames ? String(Math.round(m.bytes / m.frames)) : '-'),
            el('span', {}, 'level'), el('span', {}, '█'.repeat(Math.min(20, Math.round(m.rms * 60))) || '·'),
            el('span', {}, 'speakerRole'), el('span', {}, JSON.stringify(m.roles)),
            el('span', {}, 'direction'), el('span', {}, m.directions.size ? [...m.directions].slice(0, 8).join(', ') : 'null'),
          )
        : null,
    ),

    el('div', { class: 'card' },
      el('p', {}, el('strong', {}, t('diag.glyph.title'))),
      el('p', { class: 'dim' }, t('diag.glyph.desc')),
      el('div', { class: 'report' }, GLYPH_SAMPLES.join('\n')),
      el('button', { class: 'btn secondary', disabled: !ctx.inEvenApp, on: { click: toggleGlyphs } },
        state.glyphsShown ? '✕' : t('diag.glyph.run')),
    ),

    el('div', { class: 'card' },
      el('p', {}, el('strong', {}, t('diag.trace.title'))),
      el('p', { class: 'dim' }, t('diag.trace.desc')),
      el('button', { class: 'btn secondary', on: { click: () => { clearTrace(); rerender() } } }, t('diag.trace.clear')),
      el('div', { class: 'report' }, traceEntries().slice(-60).join('\n') || '-'),
    ),

    el('button', { class: 'btn', on: { click: () => void copyReport() } }, state.copied ? t('diag.copied') : t('diag.copy')),
  )
}

/**
 * navigator.clipboard only exists in secure contexts; the dev build is served
 * over plain http on the LAN, so fall back to a hidden textarea + execCommand.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

function resultView(result: CheckResult | 'pending' | null, pendingText: string): HTMLElement | null {
  if (!result) return null
  if (result === 'pending') return el('p', { class: 'dim' }, pendingText)
  return el('div', {},
    el('p', { class: result.ok ? 'ok' : 'bad' }, `${result.ok ? '✔' : '✘'} ${result.summary} (${result.durationMs} ms)`),
    el('div', { class: 'report' }, result.details.join('\n')),
  )
}

/** Plain-text report the user can paste back to the developer. Contains no keys or speech. */
function report(ctx: UiContext): string {
  const fmt = (r: CheckResult | 'pending' | null) =>
    !r ? 'not run' : r === 'pending' ? 'running' : `${r.ok ? 'OK' : 'FAIL'} ${r.summary} | ${r.details.join(' | ')}`
  const m = state.mic
  return [
    `SmallTalk Assist diagnostics`,
    `ua: ${navigator.userAgent}`,
    `evenApp: ${ctx.inEvenApp}`,
    `websocket: ${fmt(state.ws)}`,
    `fetch: ${fmt(state.fetch)}`,
    `fetch+auth: ${fmt(state.fetchAuth)}`,
    `mic(${ctx.settings.get().micSource}): frames=${m.frames} bytes/frame=${m.frames ? Math.round(m.bytes / m.frames) : 0} roles=${JSON.stringify(m.roles)} directions=${[...m.directions].slice(0, 8).join(',') || 'null'}`,
    `--- trace (this run) ---`,
    ...traceEntries(),
    `--- earlier runs (newest first) ---`,
    ...previousRunTraces().flat(),
  ].join('\n')
}
