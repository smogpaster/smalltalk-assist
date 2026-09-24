import { getAdvW, getTextWidth, measureTextWrap, pxTruncate } from '@evenrealities/pretext'

/** LVGL line height used by the G2 firmware. */
export const LINE_HEIGHT = 27

/**
 * Glyphs that LLMs like to emit but the firmware font lacks, mapped to
 * something that renders. Anything else missing is dropped (the firmware
 * would drop it silently anyway, which can glue words together).
 */
const REPLACEMENTS: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': ',',
  '′': "'",
  '″': '"',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '–': '–',
  '—': '–',
  '−': '-',
  '→': '→',
  '↳': '→',
  '✓': '+',
  '✔': '+',
  '✕': 'x',
  '✖': 'x',
  '•': '•',
}

function isRenderable(codePoint: number): boolean {
  if (codePoint === 0x0a) return true
  return getAdvW(codePoint) > 0
}

/** Replaces or removes characters the firmware font cannot draw. */
export function sanitizeForGlasses(input: string): string {
  let out = ''
  for (const ch of input.normalize('NFC')) {
    const replacement = REPLACEMENTS[ch]
    const candidate = replacement ?? ch
    let kept = ''
    for (const c of candidate) {
      if (isRenderable(c.codePointAt(0)!)) kept += c
    }
    out += kept
  }
  // Collapse whitespace introduced by removed emoji etc., keep explicit newlines.
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

export function lineCount(text: string, width: number): number {
  if (!text) return 0
  return measureTextWrap(text, width).lineCount
}

/**
 * Shortens `text` so that it wraps into at most `maxLines` lines of `width`
 * pixels, cutting at a word boundary and appending "…" when shortened.
 */
export function fitLines(text: string, width: number, maxLines: number): string {
  if (maxLines <= 0) return ''
  if (lineCount(text, width) <= maxLines) return text
  if (maxLines === 1) return pxTruncate(text, width).replace(/\.\.\.$/, '…')

  const words = text.split(/(\s+)/)
  let fitted = ''
  for (const word of words) {
    const candidate = fitted + word
    if (lineCount(candidate.trimEnd() + '…', width) > maxLines) break
    fitted = candidate
  }
  fitted = fitted.trimEnd()
  if (!fitted) {
    // No break opportunity (e.g. long CJK run without spaces): cut by characters.
    for (const ch of text) {
      if (lineCount(fitted + ch + '…', width) > maxLines) break
      fitted += ch
    }
  }
  return fitted.replace(/[\s,;:.–-]+$/, '') + '…'
}

/** Pads `left` with spaces so that `right` appears near the right edge. */
export function spreadLine(left: string, right: string, width: number): string {
  const space = Math.max(1, getTextWidth(' '))
  const gap = width - getTextWidth(left) - getTextWidth(right)
  const spaces = Math.max(1, Math.floor(gap / space))
  return left + ' '.repeat(spaces) + right
}
