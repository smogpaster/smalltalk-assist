// Fails the pack when the built bundle contains anything that looks like a
// hardcoded credential. Store review scans the bundle (dependencies included)
// and rejected 1.0.0 for a dummy diagnostic key.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PATTERNS = [
  /Bearer [A-Za-z0-9._~+/-]{6,}/,
  /sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{16,}|xai-[A-Za-z0-9]{16,}/,
  /(api_?key|apiKey|token|secret|password)["']?\s*[:=]\s*["'`][^"'`$]{6,}["'`]/i,
]

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(js|html|css|json)$/.test(name) ? [path] : []
  })
}

const hits = []
for (const file of files('dist')) {
  const text = readFileSync(file, 'utf8')
  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (match) hits.push(`${file}: ${match[0].slice(0, 60)}`)
  }
}
if (hits.length) {
  console.error('Credential-like strings in the bundle:\n' + hits.join('\n'))
  process.exit(1)
}
console.log('Bundle scan: no credential-like strings')
