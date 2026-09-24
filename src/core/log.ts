/**
 * Debug logging for development. Privacy rule: never pass conversation text,
 * transcripts, suggestions or API keys – only event names, counts, timings
 * and error kinds.
 */
const enabled = import.meta.env.DEV

export function debug(scope: string, message: string, data?: Record<string, string | number | boolean | null>): void {
  if (!enabled) return
  console.log(`[${scope}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`)
}
