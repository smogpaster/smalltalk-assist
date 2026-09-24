/**
 * Serializes bridge calls. Concurrent render + storage calls can drop the BLE
 * link, and a single flaky hop can hang for ~30 s, so every call goes through
 * one FIFO with a per-call timeout.
 */
export class BridgeQueue {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly defaultTimeoutMs = 5000) {}

  run<T>(task: () => Promise<T>, timeoutMs = this.defaultTimeoutMs): Promise<T> {
    const result = this.tail.then(() => withTimeout(task(), timeoutMs))
    // Keep the chain alive even if this task fails.
    this.tail = result.catch(() => undefined)
    return result
  }
}

export class BridgeTimeoutError extends Error {
  constructor(ms: number) {
    super(`Bridge call timed out after ${ms} ms`)
    this.name = 'BridgeTimeoutError'
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BridgeTimeoutError(ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
