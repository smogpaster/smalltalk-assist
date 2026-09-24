# SmallTalk Assist

Conversation helper for **Even Realities G2** smart glasses. It listens to a
conversation, transcribes it and shows short small-talk suggestions (questions
and reply ideas) on the glasses. Bring your own API keys; transcripts and
suggestions live only in memory.

> Status: **milestone 7** – demo mode, glasses display, gestures, contextual
> menu, diagnostics, live speech-to-text (Soniox, Deepgram, Speechmatics,
> Gladia), live AI suggestions (Claude, OpenAI, Gemini, Mistral and seven
> OpenAI-compatible hosts), speaker mapping (me / other), profiles and
> optional extras. Next: onboarding, privacy texts, store preparation (M8).

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
| Tap | start / stop the conversation (in quiet mode: show suggestions again) |
| Swipe up / down | page through suggestions |
| Tap, then long press | menu: start/stop, quiet mode, enabled extras, back |
| Double tap | exit dialog |

A long press alone does nothing: on the device the menu gesture often reaches
the app as a bare long press, so it cannot double as a quiet-mode toggle.

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
not part of v1.

## AI (LLM) providers

*Settings → AI suggestions*: choose a provider, paste your key, *Test
connection* (a real, tiny request with the selected model) and optionally
*Load available models*. Without a provider, live mode shows the transcript.

| Provider | Default model | Notes |
|---|---|---|
| Anthropic (Claude) | `claude-haiku-4-5` | official `@anthropic-ai/sdk`, browser mode |
| OpenAI | `gpt-6-luna` | Chat Completions, `max_completion_tokens` |
| Google Gemini | `gemini-3.5-flash-lite` | `streamGenerateContent`, key in header |
| Mistral | `mistral-small-latest` | Chat Completions |
| OpenRouter, Groq, Together, DeepSeek, Cerebras, Fireworks, xAI | – (pick from list) | OpenAI-compatible presets |

A free-form base URL is not offered: the Even Hub network whitelist is fixed
when the app is packed, so only these origins are reachable. All of them
allow browser (CORS) calls (checked 2026-09-24).

### How suggestions are triggered

- the other person finished a sentence → wait *Pause* (default 0.9 s)
- I finished a sentence and nobody speaks for 4 s → fresh ideas
- anyone speaking again postpones; a newer trigger aborts an older request
- rate limit: *minimum interval* (default 6 s) and *max per minute* (6);
  blocked triggers are merged and fired when allowed
- only the last 3 minutes (max 4000 characters) are sent
- answers stream: the first suggestion appears before the answer is complete
- quiet mode sends no requests

## Profiles and conversation partner

*Profile* tab: several profiles (starter set: Networking, Family party, Client
meeting), each with tone (casual / professional / warm), *about me*, *topics to
avoid* and an optional goal. For the next conversation you can add who you
talk to (name, relationship, interests, mutual acquaintances, what to bring up
or avoid). Everything goes into the system prompt – background as optional
context, topics to avoid as a hard rule. Fields are capped at 600 characters;
the conversation-partner info stays on the phone until you clear it.

## Speaker mapping (me / other)

With the glasses microphone the Even app classifies every 50 ms audio frame as
*self* or *other*. Each finished utterance is matched to its frames by time
and decided by majority; the STT provider's diarization label is learned from
those decisions and used when frames are missing. During a live conversation
the *Conversation* tab offers *Next sentence is me* (calibration) and *Swap
speakers*. Suggestions are triggered by the other person's sentences; after
the wearer's own sentence only after ~4 s of silence.

## Extras (Settings → Extras, all off by default)

| Extra | How it works | Cost |
|---|---|---|
| ☰ Change topic | menu item → 2 transitions to a new topic fitting the profile | 1 request |
| ☰ Remember names | names from introductions, returned alongside suggestions; menu shows them | slightly longer requests |
| Talk share hint | local: your share of speaking time over 5 min; hint above 70 % (clears below 60 %) | none |
| Lull detection | after 15 s without speech, 2 openers | 1 request per lull |
| Callbacks | one suggestion may pick up an earlier point (10 min window) | slightly longer requests |
| Term explainer | one-line explanation of an unusual term the partner used | slightly longer requests |
| ☰ Exit line | menu item → 2 polite ways to wrap up | 1 request |
| ☰ Recap | menu item → 2-line summary of the last minutes | 1 request |

☰ = contextual menu on the glasses (tap, then long press). Names and all
other extra output live in memory only and are gone when the conversation ends.

## Project structure

```
src/
  app/        session state machine, glasses controller, provider selection
  audio/      microphone via the Even bridge
  bridge/     bridge connection, serialized call queue, event normalizer, preview
  core/       shared types, provider errors
  diag/       keyless hardware checks, privacy-safe event trace
  display/    glasses layout, glyph sanitizing, pixel-accurate text fitting, renderer
  engine/     transcript window, prompt, suggestion format, suggestion engine
  i18n/       de / en / ja catalogs (add a language = one file)
  llm/        LLM interface, SSE reader, adapters, provider registry
  mock/       scripted demo conversations, mock STT and LLM
  profiles/   profiles, conversation partner, prompt context
  settings/   schema + migration, SDK key-value storage, API key store
  speakers/   diarization label → self/other
  stt/        STT interface, utterance assembler, adapters, provider registry
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
in memory and are discarded when a conversation ends. Settings and API keys
are stored locally via the Even app's storage; each key is sent only to its
own provider.
