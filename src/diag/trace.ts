/**
 * In-memory event trace for diagnosing behaviour on real hardware, shown and
 * copyable on the Diagnostics page. Privacy rule: only event names, counts,
 * timings and error kinds – never speech, suggestions or keys.
 * Kept in memory only, capped, cleared on reload.
 */
const MAX_ENTRIES = 300
const startedAt = Date.now()
const entries: string[] = []
const listeners = new Set<() => void>()

export function trace(scope: string, message: string, data?: Record<string, string | number | boolean | null | undefined>): void {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  const line = `${seconds}s [${scope}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`
  entries.push(line)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  if (import.meta.env.DEV) console.log(line)
  for (const listener of listeners) listener()
}

export function traceEntries(): readonly string[] {
  return entries
}

export function clearTrace(): void {
  entries.length = 0
  for (const listener of listeners) listener()
}

export function onTrace(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Watches for stalled timers and visibility changes. A 1 s interval that
 * fires late means the host throttled or suspended the WebView.
 */
export function startRuntimeWatch(): void {
  let last = Date.now()
  setInterval(() => {
    const now = Date.now()
    const gap = now - last
    last = now
    if (gap > 2500) trace('runtime', 'timer gap', { ms: gap })
  }, 1000)
  document.addEventListener('visibilitychange', () => trace('runtime', 'visibility', { state: document.visibilityState }))
  window.addEventListener('pagehide', () => trace('runtime', 'pagehide'))
  window.addEventListener('pageshow', () => trace('runtime', 'pageshow'))
  trace('runtime', 'start', { visibility: document.visibilityState })
}
