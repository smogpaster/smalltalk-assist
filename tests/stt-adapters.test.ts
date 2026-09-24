import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../src/core/errors'
import { DeepgramProvider } from '../src/stt/providers/deepgram'
import { GladiaProvider } from '../src/stt/providers/gladia'
import { SonioxProvider } from '../src/stt/providers/soniox'
import { SpeechmaticsProvider } from '../src/stt/providers/speechmatics'
import type { SttResult } from '../src/stt/types'

/** Minimal WebSocket double: records what is sent, lets tests push messages. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static failNext = false
  static readonly OPEN = 1
  readyState = 0
  binaryType = 'blob'
  sent: (string | ArrayBuffer)[] = []
  onopen: (() => void) | null = null
  onclose: ((e: { code: number; reason: string; wasClean: boolean }) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null

  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this)
    const fail = FakeWebSocket.failNext
    FakeWebSocket.failNext = false
    queueMicrotask(() => {
      if (fail) {
        this.readyState = 3
        this.onclose?.({ code: 1006, reason: '', wasClean: false })
      } else {
        this.readyState = 1
        this.onopen?.()
      }
    })
  }
  send(data: string | ArrayBuffer) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
  }
  push(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code, reason: '', wasClean: false })
  }
  json(index: number) {
    return JSON.parse(this.sent[index] as string)
  }
}

const options = { language: 'de', diarization: true, sampleRate: 16000 as const }
const pcm = new Uint8Array([1, 2, 3, 4])

let results: SttResult[]
let errors: ProviderError[]
const callbacks = () => ({ onResult: (r: SttResult) => results.push(r), onError: (e: ProviderError) => errors.push(e) })
const socket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

beforeEach(() => {
  FakeWebSocket.instances = []
  results = []
  errors = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Soniox', () => {
  it('authenticates in-band and assembles tokens into utterances', async () => {
    const session = await new SonioxProvider('sk-test').start(options, callbacks())
    const ws = socket()
    expect(ws.url).toBe('wss://stt-rt.soniox.com/transcribe-websocket')
    expect(ws.json(0)).toMatchObject({
      api_key: 'sk-test',
      model: 'stt-rt-v5',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      num_channels: 1,
      language_hints: ['de'],
      enable_speaker_diarization: true,
      enable_endpoint_detection: true,
    })

    session.sendPcm(pcm)
    expect(ws.sent[1]).toBeInstanceOf(ArrayBuffer)

    ws.push({ tokens: [{ text: 'Hal', is_final: false, speaker: '1', start_ms: 0, end_ms: 100 }] })
    ws.push({ tokens: [{ text: 'Hallo', is_final: true, speaker: '1', start_ms: 0, end_ms: 300 }, { text: ' wie', is_final: false, speaker: '1' }] })
    ws.push({ tokens: [{ text: ' wie geht', is_final: true, speaker: '1', start_ms: 300, end_ms: 700 }, { text: '<end>', is_final: true }] })
    ws.push({ tokens: [{ text: 'Gut', is_final: true, speaker: '2', start_ms: 900, end_ms: 1100 }, { text: '<end>', is_final: true }] })

    expect(results.map(r => [r.id, r.text, r.isFinal, r.speakerLabel])).toEqual([
      ['soniox-0', 'Hal', false, '1'],
      ['soniox-0', 'Hallo wie', false, '1'],
      ['soniox-0', 'Hallo wie geht', true, '1'],
      ['soniox-1', 'Gut', true, '2'],
    ])
  })

  it('uses language identification for auto and reports in-band errors', async () => {
    await new SonioxProvider('bad').start({ ...options, language: 'auto' }, callbacks())
    const ws = socket()
    expect(ws.json(0).enable_language_identification).toBe(true)
    expect(ws.json(0).language_hints).toBeUndefined()
    ws.push({ error_code: 401, error_type: 'unauthenticated', error_message: 'Incorrect API key' })
    expect(errors[0].kind).toBe('auth')
  })

  it('reports an unexpected close as retryable network error, but not a requested close', async () => {
    const session = await new SonioxProvider('k').start(options, callbacks())
    socket().drop(1006)
    expect(errors.map(e => [e.kind, e.retryable])).toEqual([['network', true]])

    errors = []
    const second = await new SonioxProvider('k').start(options, callbacks())
    await second.close()
    socket().drop(1000)
    expect(errors).toHaveLength(0)
    void session
  })
})

describe('Deepgram', () => {
  it('passes the key as subprotocol and splits diarized finals by speaker', async () => {
    await new DeepgramProvider('dg-key').start(options, callbacks())
    const ws = socket()
    expect(ws.protocols).toEqual(['token', 'dg-key'])
    const url = new URL(ws.url)
    expect(url.origin + url.pathname).toBe('wss://api.deepgram.com/v1/listen')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'nova-3',
      language: 'de',
      encoding: 'linear16',
      sample_rate: '16000',
      interim_results: 'true',
      diarize_model: 'latest',
    })

    ws.push({ type: 'Results', is_final: false, start: 0, duration: 0.5, channel: { alternatives: [{ transcript: 'Hallo', words: [{ word: 'hallo', start: 0, end: 0.4, speaker: 0 }] }] } })
    ws.push({
      type: 'Results', is_final: true, speech_final: true, start: 0, duration: 1.5,
      channel: { alternatives: [{ transcript: 'Hallo. Ja?', words: [
        { word: 'hallo', punctuated_word: 'Hallo.', start: 0, end: 0.4, speaker: 0 },
        { word: 'ja', punctuated_word: 'Ja?', start: 1, end: 1.3, speaker: 1 },
      ] }] },
    })

    const finals = results.filter(r => r.isFinal).map(r => [r.text, r.speakerLabel])
    expect(finals).toEqual([['Hallo.', '0'], ['Ja?', '1']])
    expect(results[0]).toMatchObject({ text: 'Hallo', isFinal: false, speakerLabel: '0' })
  })

  it('maps auto to multi and ends utterances on UtteranceEnd', async () => {
    await new DeepgramProvider('k').start({ ...options, language: 'auto', diarization: false }, callbacks())
    const ws = socket()
    const params = new URL(ws.url).searchParams
    expect(params.get('language')).toBe('multi')
    expect(params.has('diarize_model')).toBe(false)
    ws.push({ type: 'Results', is_final: true, speech_final: false, start: 0, duration: 1, channel: { alternatives: [{ transcript: 'Hello there' }] } })
    expect(results.some(r => r.isFinal)).toBe(false)
    ws.push({ type: 'UtteranceEnd' })
    expect(results.filter(r => r.isFinal).map(r => r.text)).toEqual(['Hello there'])
  })

  it('sends CloseStream on close', async () => {
    const session = await new DeepgramProvider('k').start(options, callbacks())
    await session.close()
    expect(socket().json(0)).toEqual({ type: 'CloseStream' })
  })

  it('tests the key with a tiny REST transcription', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await new DeepgramProvider('dg-key').testConnection()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.deepgram.com/v1/listen?model=nova-3')
    expect((init.headers as Record<string, string>).Authorization).toBe('Token dg-key')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"err":"x"}', { status: 401 })))
    await expect(new DeepgramProvider('bad').testConnection()).rejects.toMatchObject({ kind: 'auth', status: 401 })
  })
})

describe('Speechmatics', () => {
  it('mints a temporary key, starts recognition and handles transcripts', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ key_value: 'jwt-123' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = await new SpeechmaticsProvider('sm-key').start(options, callbacks())

    const [tokenUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(tokenUrl).toBe('https://mp.speechmatics.com/v1/api_keys?type=rt')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sm-key')
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 60 })

    const ws = socket()
    expect(ws.url).toBe('wss://eu.rt.speechmatics.com/v2?jwt=jwt-123')
    expect(ws.json(0)).toMatchObject({
      message: 'StartRecognition',
      audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 },
      transcription_config: { language: 'de', enable_partials: true, diarization: 'speaker' },
    })

    session.sendPcm(pcm) // before RecognitionStarted: dropped
    ws.push({ message: 'RecognitionStarted' })
    session.sendPcm(pcm)
    expect(ws.sent.filter(x => x instanceof ArrayBuffer)).toHaveLength(1)

    ws.push({ message: 'AddPartialTranscript', metadata: { transcript: 'Guten', start_time: 0, end_time: 0.4 }, results: [{ type: 'word', start_time: 0, end_time: 0.4, alternatives: [{ content: 'Guten', speaker: 'S1' }] }] })
    ws.push({ message: 'AddTranscript', metadata: { transcript: 'Guten Tag.' }, results: [
      { type: 'word', start_time: 0, end_time: 0.4, alternatives: [{ content: 'Guten', speaker: 'S1' }] },
      { type: 'word', start_time: 0.4, end_time: 0.7, alternatives: [{ content: 'Tag', speaker: 'S1' }] },
      { type: 'punctuation', start_time: 0.7, end_time: 0.7, alternatives: [{ content: '.', speaker: 'S1' }] },
    ] })
    ws.push({ message: 'EndOfUtterance', metadata: { start_time: 1, end_time: 1 } })

    expect(results.filter(r => r.isFinal).map(r => [r.text, r.speakerLabel])).toEqual([['Guten Tag.', 'S1']])

    await session.close()
    expect(ws.json(ws.sent.length - 1)).toEqual({ message: 'EndOfStream', last_seq_no: 1 })
  })

  it('maps error types and refuses auto language', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ key_value: 'j' }), { status: 201 })))
    await expect(new SpeechmaticsProvider('k').start({ ...options, language: 'auto' }, callbacks())).rejects.toMatchObject({ kind: 'unsupported' })
    await new SpeechmaticsProvider('k').start({ ...options, language: 'zh' }, callbacks())
    expect(socket().json(0).transcription_config.language).toBe('cmn')
    socket().push({ message: 'Error', type: 'not_authorised', reason: 'bad key' })
    expect(errors[0].kind).toBe('auth')
  })
})

describe('Gladia', () => {
  it('initialises a session and numbers utterances itself', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 's1', url: 'wss://api.gladia.io/v2/live?token=abc' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = await new GladiaProvider('gl-key').start({ ...options, language: 'auto' }, callbacks())

    const [initUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(initUrl).toBe('https://api.gladia.io/v2/live')
    expect((init.headers as Record<string, string>)['x-gladia-key']).toBe('gl-key')
    expect(JSON.parse(init.body as string)).toMatchObject({
      encoding: 'wav/pcm', bit_depth: 16, sample_rate: 16000, channels: 1, model: 'solaria-1',
      language_config: { languages: [], code_switching: true },
      messages_config: { receive_partial_transcripts: true, receive_final_transcripts: true },
    })
    const ws = socket()
    expect(ws.url).toBe('wss://api.gladia.io/v2/live?token=abc')

    ws.push({ type: 'transcript', data: { id: 'p1', is_final: false, utterance: { text: 'Bonjour', start: 0, end: 0.5, language: 'fr' } } })
    ws.push({ type: 'transcript', data: { id: 'f1', is_final: true, utterance: { text: 'Bonjour à tous', start: 0, end: 1.2, language: 'fr' } } })
    ws.push({ type: 'transcript', data: { id: 'p2', is_final: false, utterance: { text: 'Merci', start: 2, end: 2.3 } } })
    expect(results.map(r => [r.id, r.text, r.isFinal])).toEqual([
      ['gladia-0', 'Bonjour', false],
      ['gladia-0', 'Bonjour à tous', true],
      ['gladia-1', 'Merci', false],
    ])
    expect(results[1].language).toBe('fr')

    await session.close()
    expect(ws.json(0)).toEqual({ type: 'stop_recording' })
  })

  it('surfaces HTTP errors from session init', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"no"}', { status: 401 })))
    await expect(new GladiaProvider('bad').start(options, callbacks())).rejects.toMatchObject({ kind: 'auth' })
  })
})

describe('WebSocket handshake failure', () => {
  it('rejects with a network error', async () => {
    FakeWebSocket.failNext = true
    await expect(new SonioxProvider('k').start(options, callbacks())).rejects.toMatchObject({ kind: 'network' })
  })
})
