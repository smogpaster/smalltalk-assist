# SmallTalk Assist

Conversation helper for **Even Realities G2** smart glasses. It listens to a
conversation, transcribes it and shows short small-talk suggestions (questions
and reply ideas) on the glasses. Bring your own API keys; transcripts and
suggestions live only in memory.

> Status: **milestone 3 (part 1)** – demo mode, glasses display, gestures,
> contextual menu, diagnostics, live speech-to-text (Soniox, Deepgram,
> Speechmatics, Gladia). LLM suggestions for live mode follow in milestone 4;
> until then live mode shows the transcript on the glasses.

## Requirements

- Node.js 20+
- Even Realities app ≥ 2.2.10 on the phone (built on SDK 0.0.16: speaker role, long press)
- For hardware tests: phone and computer on the same Wi-Fi

## Development

```bash
npm install
npm run dev          # Vite on http://localhost:5180
npm test             # unit tests (Vitest)
npm run typecheck
```

Port 5180 is fixed so the app can run next to other Even Hub projects on 5173.

### Browser preview

Open http://localhost:5180 in a desktop browser. Without the Even bridge the app
runs in preview mode: the glasses view is mirrored on the page and the keyboard
simulates gestures – `Space` tap, `↑`/`↓` swipe, `Q` long press.

### Simulator

```bash
npm run dev
npm run simulate         # or: npm run simulate:auto  (automation API on :9898)
```

Tap (click) the glasses display to start the demo conversation, arrow keys to
page, double click for the exit dialog. After larger code edits restart the
simulator – hot reload can leave stale event handlers behind.

### On the glasses

```bash
npm run dev:device       # dev server without hot reload
npm run qr               # prints a QR code for http://<your-ip>:5180
```

Use `dev:device` for hardware tests: with hot reload every code edit on the
Mac restarts the app on the phone, which looks exactly like a crash.

Scan it in the Even Realities app (Developer Center / developer mode → scan).
The app loads on your G2.

## Using the app

| Gesture (temple or R1 ring) | Action |
|---|---|
| Tap | start / stop the conversation |
| Swipe up / down | page through suggestions |
| Long press | quiet mode on / off |
| Double tap | exit dialog |

**Demo mode** (default) plays a scripted conversation in German, English or
Japanese – no microphone, no keys, no network. Switch it in *Settings*.

**Diagnostics** (phone screen) checks WebSockets, HTTPS, the microphone
(including the glasses' self/other speaker classification) and glyph rendering
on the real device. "Copy report" produces a text without keys or speech.

## Speech-to-text providers

Choose one in *Settings → Speech recognition*, paste your API key and press
*Test connection*. Keys are stored only on the phone (Even app storage) and
sent only to that provider.

| Provider | Auth from the app | Speaker separation | Auto language |
|---|---|---|---|
| Soniox (`stt-rt-v5`) | key inside the first WebSocket message | yes | yes |
| Deepgram (`nova-3`) | WebSocket subprotocol `token` | yes | yes (`multi`) |
| Speechmatics | 60 s temporary key (JWT) in the URL¹ | yes | no |
| Gladia (`solaria-1`) | session URL from `POST /v2/live` | no (live) | yes |

¹ Speechmatics documents temporary keys partly as an enterprise feature; the
connection test shows whether your account can use them.

Not included: AssemblyAI and Google Cloud STT (no browser-compatible
streaming auth without a server). OpenAI Realtime and Mistral Voxtral are
planned as a second step.

## Project structure

```
src/
  app/        session state machine, glasses controller, provider selection
  audio/      microphone via the Even bridge
  bridge/     bridge connection, serialized call queue, event normalizer, preview
  core/       shared types, provider errors, privacy-safe debug log
  diag/       keyless hardware checks
  display/    glasses layout, glyph sanitizing, pixel-accurate text fitting, renderer
  engine/     transcript window, prompt, suggestion format, suggestion engine
  i18n/       de / en / ja catalogs (add a language = one file)
  llm/        LLM provider interface (adapters in M4)
  mock/       scripted demo conversations, mock STT and LLM
  settings/   schema + migration, SDK key-value storage
  speakers/   diarization label → self/other
  stt/        STT provider interface (adapters in M3)
  ui/         phone screens
tests/        Vitest unit tests
docs/         platform notes
```

## Packaging

```bash
npm run pack             # builds dist/ and creates smalltalk-assist.ehpk
```

Submission checklist and store texts follow in milestone 8.

## Privacy

No analytics, no conversation logging. Transcripts and suggestions exist only
in memory and are discarded when a conversation ends. Settings (and later API
keys) are stored locally via the Even app's storage.
