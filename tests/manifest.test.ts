import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STT_PROVIDERS } from '../src/stt/registry'

const manifest = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
  permissions: { name: string; whitelist?: string[] }[]
}
const whitelist = manifest.permissions.find(p => p.name === 'network')?.whitelist ?? []

describe('app.json network whitelist', () => {
  it('contains every origin a provider adapter talks to', () => {
    for (const provider of STT_PROVIDERS) {
      for (const origin of provider.origins) expect(whitelist, `${provider.id}: ${origin}`).toContain(origin)
    }
  })

  it('contains nothing unused', () => {
    const used = new Set(STT_PROVIDERS.flatMap(p => p.origins))
    for (const origin of whitelist) expect(used.has(origin), origin).toBe(true)
  })
})
