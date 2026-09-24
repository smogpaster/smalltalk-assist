/**
 * Limits LLM requests: a minimum gap between requests and a maximum per
 * rolling minute. Keeps costs predictable and the display calm.
 */
export class RateLimiter {
  private history: number[] = []

  constructor(private readonly limits: () => { minIntervalMs: number; maxPerMinute: number }) {}

  /** Earliest time (ms) a request may start; <= now means "now". */
  nextAllowedAt(now: number): number {
    const { minIntervalMs, maxPerMinute } = this.limits()
    this.history = this.history.filter(t => now - t < 60_000)
    let at = now
    const last = this.history[this.history.length - 1]
    if (last !== undefined) at = Math.max(at, last + minIntervalMs)
    if (maxPerMinute > 0 && this.history.length >= maxPerMinute) {
      at = Math.max(at, this.history[this.history.length - maxPerMinute] + 60_000)
    }
    return at
  }

  record(now: number): void {
    this.history.push(now)
  }
}
