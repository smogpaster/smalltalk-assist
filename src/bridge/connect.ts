import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk'

/**
 * Resolves the Even bridge, or null when the page runs in a plain desktop
 * browser (`npm run dev` without the simulator). Never hangs the bootstrap.
 */
export async function connectBridge(timeoutMs = 2500): Promise<EvenAppBridge | null> {
  const hasHost = () => typeof window !== 'undefined' && 'flutter_inappwebview' in window
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))
  try {
    const bridge = await Promise.race([waitForEvenAppBridge(), timeout])
    return bridge && hasHost() ? bridge : null
  } catch (err) {
    console.warn('[bridge] not available', (err as Error).message)
    return null
  }
}
