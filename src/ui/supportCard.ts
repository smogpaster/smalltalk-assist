import qrcode from 'qrcode-generator'
import { TIP_URL } from '../support'
import { copyText } from './clipboard'
import type { UiContext } from './context'
import { el } from './dom'

const state = { copied: false, showQr: false }

/**
 * "Support the app": the Even app cannot open the system browser (Even Hub
 * FAQ), so instead of a navigating link we show the address, a copy button
 * and a QR code for a second device. Hidden while no tip URL is configured.
 */
export function supportCard(ctx: UiContext, rerender: () => void, compact = false): HTMLElement | null {
  if (!TIP_URL) return null
  const t = ctx.t()
  const copy = async () => {
    state.copied = await copyText(TIP_URL)
    rerender()
  }
  return el(
    'div',
    { class: 'card support' },
    el('p', {}, el('strong', {}, t('support.title'))),
    compact ? null : el('p', { class: 'dim' }, t('support.body')),
    el('p', { class: 'support-url' }, TIP_URL.replace(/^https:\/\//, '')),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn', on: { click: () => void copy() } }, state.copied ? t('support.copied') : t('support.copy')),
      el('button', { class: 'btn secondary', on: { click: () => { state.showQr = !state.showQr; rerender() } } }, t('support.qr')),
    ),
    state.copied ? el('p', { class: 'dim', style: 'margin-top:8px' }, t('support.pasteHint')) : null,
    state.showQr ? qrSvg(TIP_URL) : null,
  )
}

/** Builds the QR code as DOM (no innerHTML): black modules on white for reliable scanning. */
function qrSvg(url: string): SVGSVGElement {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  const count = qr.getModuleCount()
  const margin = 4
  const size = count + margin * 2
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('class', 'support-qr')
  svg.setAttribute('shape-rendering', 'crispEdges')
  const background = document.createElementNS(ns, 'rect')
  background.setAttribute('width', String(size))
  background.setAttribute('height', String(size))
  background.setAttribute('fill', '#fff')
  svg.append(background)
  let path = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`
    }
  }
  const modules = document.createElementNS(ns, 'path')
  modules.setAttribute('d', path)
  modules.setAttribute('fill', '#000')
  svg.append(modules)
  return svg
}
