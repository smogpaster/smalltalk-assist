/**
 * In-memory event trace for diagnosing behaviour on real hardware, shown and
 * copyable on the Diagnostics page. Privacy rule: only event names, counts,
 * timings and error kinds – never speech, suggestions or keys.
 * Kept in memory only, capped, cleared on reload.
 */
import type { KeyValueStore } from '../settings/kv'

const MAX_ENTRIES = 300
const PERSIST_KEY = 'trace.last'
const PERSIST_ENTRIES = 150
const PERSIST_INTERVAL_MS = 3000
const startedAt = Date.now()
const entries: string[] = []
const listeners = new Set<() => void>()
let previousRun: string[] = []
let dirty = false

export function trace(scope: string, message: string, data?: Record<string, string | number | boolean | null | undefined>): void {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  const line = `${seconds}s [${scope}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`
  entries.push(line)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  dirty = true
  if (import.meta.env.DEV) console.log(line)
  for (const listener of listeners) listener()
}

/** Trace of the previous app run (e.g. before a crash or forced close). */
export function previousRunEntries(): readonly string[] {
  return previousRun
}

/**
 * Keeps the trace across crashes: loads the previous run once, then writes
 * the current run every few seconds while it changes. The trace holds no
 * conversation content, so persisting it is fine; it is overwritten on the
 * next launch.
 */
export async function persistTrace(kv: KeyValueStore): Promise<void> {
  try {
    const raw = await kv.get(PERSIST_KEY)
    previousRun = raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    previousRun = []
  }
  trace('boot', 'previous run trace', { entries: previousRun.length, last: previousRun.at(-1)?.slice(0, 60) ?? null })
  const save = () => {
    if (!dirty) return
    dirty = false
    kv.set(PERSIST_KEY, JSON.stringify(entries.slice(-PERSIST_ENTRIES))).catch(() => undefined)
  }
  setInterval(save, PERSIST_INTERVAL_MS)
  document.addEventListener('visibilitychange', save)
  save()
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
  window.addEventListener('error', event => trace('runtime', 'js error', { message: String(event.message).slice(0, 120), at: `${event.filename?.split('/').pop()}:${event.lineno}` }))
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason as { name?: string; message?: string } | undefined
    trace('runtime', 'unhandled rejection', { message: `${reason?.name ?? ''} ${reason?.message ?? String(event.reason)}`.slice(0, 120) })
  })
  trace('runtime', 'start', { visibility: document.visibilityState })
}
