import type { Suggestion } from '../core/types'
import type { Translate } from '../i18n'
import { LINE_HEIGHT, fitLines, sanitizeForGlasses, spreadLine } from './text'

/** Canvas 576×288. One status line on top, one body container below. */
export const HEADER = { x: 0, y: 0, width: 576, height: 34, padding: 3 } as const
export const BODY = { x: 0, y: 34, width: 576, height: 254, padding: 4 } as const

export const HEADER_INNER_WIDTH = HEADER.width - 2 * HEADER.padding
export const BODY_INNER_WIDTH = BODY.width - 2 * BODY.padding
export const BODY_LINES = Math.floor((BODY.height - 2 * BODY.padding) / LINE_HEIGHT)

/** No suggestion may take more than this many lines – glanceability first. */
const MAX_LINES_PER_SUGGESTION = 3

export type GlassesPhase = 'idle' | 'recording' | 'quiet'

export interface GlassesViewState {
  phase: GlassesPhase
  demo: boolean
  suggestions: readonly Suggestion[]
  /** 0-based page index into `suggestions`. */
  page: number
  /** 1–3 suggestions shown at once. */
  perPage: number
  /** Short error text to show instead of suggestions. */
  error?: string
}

export interface GlassesView {
  header: string
  body: string
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)))
}

export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(0, page), pageCount(total, perPage) - 1)
}

export function linesPerSuggestion(perPage: number): number {
  const n = Math.max(1, perPage)
  // n suggestions separated by n-1 blank lines.
  return Math.max(1, Math.min(MAX_LINES_PER_SUGGESTION, Math.floor((BODY_LINES - (n - 1)) / n)))
}

export function buildGlassesView(state: GlassesViewState, t: Translate): GlassesView {
  const status =
    state.phase === 'recording' ? t('glasses.rec') : state.phase === 'quiet' ? t('glasses.paused') : t('glasses.ready')
  const left = state.demo ? `${status}  ${t('glasses.mock')}` : status

  const perPage = Math.min(3, Math.max(1, state.perPage))
  const total = state.suggestions.length
  const page = clampPage(state.page, total, perPage)
  const pages = pageCount(total, perPage)
  const right = state.phase === 'recording' && pages > 1 ? `${page + 1}/${pages}` : ''
  const header = right ? spreadLine(left, right, HEADER_INNER_WIDTH) : left

  return { header, body: buildBody(state, t, page, perPage) }
}

function buildBody(state: GlassesViewState, t: Translate, page: number, perPage: number): string {
  const error = state.error
    ? fitLines(sanitizeForGlasses(t('glasses.error', { message: state.error })), BODY_INNER_WIDTH, 3)
    : ''
  if (state.phase === 'idle') return error ? `${error}\n\n${t('glasses.idle')}` : t('glasses.idle')
  if (state.phase === 'quiet') return t('glasses.quiet')
  if (error) return error
  if (state.suggestions.length === 0) return t('glasses.listening')

  const maxLines = linesPerSuggestion(perPage)
  return state.suggestions
    .slice(page * perPage, page * perPage + perPage)
    .map(s => {
      const marker = t(`glasses.kind.${s.kind}`)
      return fitLines(`${marker} ${sanitizeForGlasses(s.text)}`, BODY_INNER_WIDTH, maxLines)
    })
    .join('\n\n')
}
