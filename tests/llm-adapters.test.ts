import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnthropicProvider } from '../src/llm/providers/anthropic'
import { GeminiProvider } from '../src/llm/providers/gemini'
import { OpenAiCompatibleProvider } from '../src/llm/providers/openaiCompatible'
import { LLM_PROVIDERS } from '../src/llm/registry'

/** Builds a streaming SSE response from event data strings (split mid-chunk on purpose). */
function sse(events: { event?: string; data: string }[], status = 200): Response {
  const text = events.map(e => `${e.event ? `event: ${e.event}\n` : ''}data: ${e.data}\n\n`).join('')
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const mid = Math.floor(text.length / 2)
      controller.enqueue(encoder.encode(text.slice(0, mid)))
      controller.enqueue(encoder.encode(text.slice(mid)))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

const request = { system: 'SYS', messages: [{ role: 'user' as const, content: 'Hallo' }], maxTokens: 100, temperature: 0.7, json: true }

afterEach(() => vi.unstubAllGlobals())

describe('OpenAI-compatible adapter', () => {
  it('streams chat completions and sends the expected request', async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { data: JSON.stringify({ choices: [{ delta: { content: '{"s":[' } }] }) },
        { data: JSON.stringify({ choices: [{ delta: { content: '{"k":"q","t":"Hi?"}]}' } }] }) },
        { data: '[DONE]' },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const provider = new OpenAiCompatibleProvider({ id: 'mistral', baseUrl: 'https://api.mistral.ai/v1', apiKey: 'mk', model: 'mistral-small-latest' })
    const text = await provider.complete(request, d => deltas.push(d))
    expect(text).toBe('{"s":[{"k":"q","t":"Hi?"}]}')
    expect(deltas).toHaveLength(2)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer mk')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'mistral-small-latest',
      stream: true,
      messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'Hallo' }],
      max_tokens: 100,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })
  })

  it('uses max_completion_tokens with a floor and no temperature for OpenAI', async () => {
    const fetchMock = vi.fn(async () => sse([{ data: '[DONE]' }]))
    vi.stubGlobal('fetch', fetchMock)
    const openai = LLM_PROVIDERS.find(p => p.id === 'openai')!.create('ok', 'gpt-6-luna')
    await openai.complete(request)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.max_completion_tokens).toBe(2048)
    expect(body.max_tokens).toBeUndefined()
    expect(body.temperature).toBeUndefined()
  })

  it('maps HTTP errors and timeouts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad"}}', { status: 401 })))
    const provider = new OpenAiCompatibleProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'x', model: 'm' })
    await expect(provider.complete(request)).rejects.toMatchObject({ kind: 'auth', status: 401 })

    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    await expect(provider.complete({ ...request, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('reports a caller abort as aborted', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const controller = new AbortController()
    const provider = new OpenAiCompatibleProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'x', model: 'm' })
    const pending = provider.complete({ ...request, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('lists models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }] }), { status: 200 })))
    const provider = new OpenAiCompatibleProvider({ id: 'together', baseUrl: 'https://api.together.xyz/v1', apiKey: 'x', model: 'm' })
    expect(await provider.listModels()).toEqual(['a', 'b'])
  })
})

describe('Gemini adapter', () => {
  it('streams generateContent with the key in a header and skips thought parts', async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { data: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }] } }] }) },
        { data: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"s":[]}' }] } }] }) },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const text = await new GeminiProvider('gk').complete(request)
    expect(text).toBe('{"s":[]}')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse')
    expect(url).not.toContain('gk')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('gk')
    expect(JSON.parse(init.body as string)).toMatchObject({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'Hallo' }] }],
      generationConfig: { maxOutputTokens: 100, responseMimeType: 'application/json' },
    })
  })
})

describe('Anthropic adapter (official SDK)', () => {
  const anthropicStream = () =>
    sse([
      { event: 'message_start', data: JSON.stringify({ type: 'message_start', message: { id: 'm1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }) },
      { event: 'content_block_start', data: JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) },
      { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"s":' } }) },
      { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '[]}' } }) },
      { event: 'content_block_stop', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) },
      { event: 'message_delta', data: JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }) },
      { event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) },
    ])

  it('streams text and sends the browser header', async () => {
    const fetchMock = vi.fn(async () => anthropicStream())
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const text = await new AnthropicProvider('sk-ant').complete(request, d => deltas.push(d))
    expect(text).toBe('{"s":[]}')
    expect(deltas).toEqual(['{"s":', '[]}'])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit]
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('x-api-key')).toBe('sk-ant')
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'claude-haiku-4-5', max_tokens: 100, system: 'SYS', stream: true })
  })

  it('maps SDK errors to provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })))
    await expect(new AnthropicProvider('bad').complete(request)).rejects.toMatchObject({ kind: 'auth', status: 401 })
  })
})
