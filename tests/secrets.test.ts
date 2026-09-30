import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|js|html)$/.test(name) ? [path] : []
  })
}

// Store review rejects bundles with anything that looks like a hardcoded
// credential, even a dummy one. Keys must only come from the user at runtime.
describe('no credential literals in the app source', () => {
  const patterns = [
    /Bearer [A-Za-z0-9._~+/-]+/,
    /(Token|Basic) [A-Za-z0-9._~+/=-]{8,}/,
    /sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{16,}|xai-[A-Za-z0-9]{16,}/,
  ]
  for (const file of [...sourceFiles('src'), 'index.html']) {
    it(file, () => {
      const text = readFileSync(file, 'utf8')
      for (const pattern of patterns) expect(text).not.toMatch(pattern)
    })
  }
})
