// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createTranslator } from '../src/i18n'
import type { UiContext } from '../src/ui/context'

const ctx = { t: () => createTranslator('en') } as unknown as UiContext

describe('support card', () => {
  it('is hidden while no tip URL is configured', async () => {
    const { TIP_URL } = await import('../src/support')
    const { supportCard } = await import('../src/ui/supportCard')
    if (TIP_URL === '') expect(supportCard(ctx, () => {})).toBeNull()
  })

  it('shows the address and draws a QR code on demand', async () => {
    vi.resetModules()
    vi.doMock('../src/support', () => ({ TIP_URL: 'https://ko-fi.com/example' }))
    const { supportCard } = await import('../src/ui/supportCard')
    let card = supportCard(ctx, () => {})!
    expect(card.textContent).toContain('ko-fi.com/example')
    expect(card.querySelector('svg')).toBeNull()
    const qrButton = [...card.querySelectorAll('button')].find((b) => b.textContent === 'QR code')!
    qrButton.click()
    card = supportCard(ctx, () => {})!
    const path = card.querySelector('svg path')
    expect(path?.getAttribute('d')?.length).toBeGreaterThan(100)
    vi.doUnmock('../src/support')
  })
})
