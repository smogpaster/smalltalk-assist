# Platform notes (Even Hub / G2)

Verified facts the architecture relies on. Sources: SDK 0.0.15/0.0.16 typings/README,
official Even Hub docs (hub.evenrealities.com/docs), evenhub-templates,
even-g2-notes, even-hub-devguide, and our own tests. Last checked 2026-09-24.

## Audio
- Only path: `bridge.audioControl(true, AudioInputSource.Glasses | Phone)`.
  `getUserMedia` is blocked in the WebView.
- PCM s16le, 16 kHz, mono; frames of 3200 bytes (100 ms) in simulator 0.9.5.
- The glasses mic needs a successful `createStartUpPageContainer` first.
- `audioControl(true)` returns true even if the OS denied permission – watch for frames.
- SDK ≥ 0.0.14: each frame carries `speakerRole` (self/other/unknown, Even app
  algorithm) and `direction` (raw int16). Phone mic and simulator: `unknown`/`null`.
- There is **no** built-in ASR in the SDK.

## Display
- 576×288, 4-bit green, LVGL font, line height 27 px, no font size/alignment.
- Text limits: 1000 chars (create/rebuild), 2000 (`textContainerUpgrade`).
- `@evenrealities/pretext` has the firmware font metrics: `getAdvW(cp) === 0`
  means the glyph is missing (e.g. `↳ ✓ ⏸ ❓`). We sanitize LLM output with it.
- Cost per call (measured by others): upgrade ~83 ms, rebuild ~165 ms. Serialize all calls.

## Input & lifecycle
- Tap arrives with `eventType` undefined (protobuf drops 0). Simulator may use
  `textEvent`, hardware `sysEvent` – handle both.
- SDK ≥ 0.0.14: long press (9) / release (10), contextual menu (`menuObject`, ≤10 items, ≤32 bytes).
- Root page double tap must call `shutDownPageContainer(1)` (review requirement).
  While that dialog is open, FOREGROUND_ENTER = dialog shown, FOREGROUND_EXIT = user cancelled.
- `setBackgroundState` (mentioned in some docs) does **not** exist (checked 0.0.15 and 0.0.16).
- iOS keeps the WebView running in background; Android may suspend it (audio stops).
- **`requestAnimationFrame` never fires while the WebView is hidden** (simulator,
  locked phone). Never use it for app logic or UI scheduling.
- Simulator: Vite HMR can leave stale event registrations – restart the simulator
  after larger edits.

## Network
- `app.json` whitelist: exact origins fixed at pack time, no wildcards. Full CORS applies on top.
- CORS preflight results (2026-09-24): Anthropic ✓ (needs `anthropic-dangerous-direct-browser-access`),
  OpenAI ✓, Gemini ✓, Mistral ✓, OpenRouter ✓, Groq ✓, Deepgram REST ✓,
  Speechmatics JWT ✓, Gladia ✓, Soniox temp key ✓, **AssemblyAI token ✗**,
  **Google Cloud STT: gRPC only ✗** → both excluded from v1.
- WebSockets on iOS: **work** (verified 2026-09-24, iPhone iOS 18.7, Even app,
  wss://stt-rt.soniox.com: open 469 ms, answer 578 ms). One other app (Cue)
  had reported failures; the chunked-HTTP fallback stays as a reserve.

## Verified on hardware (iPhone iOS 18.7, G2, R1, 2026-09-24)
- Glasses mic frames: **1600 bytes = 50 ms** (simulator: 3200 bytes / 100 ms).
- `speakerRole` works (self/other both reported), `direction` values like -90…90.
- Tap: `sys:undef:<source>`; swipe: `text:1/2`; long press: `sys:9` then `sys:10`
  **without** an extra tap; ring source = 2.
- Exit dialog: double tap → ENTER (dialog shown) → EXIT on "No" → app keeps running.
- Swiping on a text container with content makes the text bounce briefly;
  an empty full-screen gesture layer behind the content avoids it.
- Hot reload of the dev server restarts the app on the phone (looks like a crash):
  use `npm run dev:device` for hardware tests.

## Contextual menu (SDK ≥ 0.0.14, docs /docs/build/contextual-menu)
- Opened by the OS with **tap, then long press** → our tap handler waits ~450 ms.
  On the device the tap is often swallowed and only a bare long press (9/10)
  reaches the app before FOREGROUND_ENTER – never bind an action to long press.
- ≤ 10 items, ≤ 32 UTF-8 bytes each; system items (display off, brightness,
  close app) are added by the OS.
- Sequence: FOREGROUND_ENTER → menuItemClickEvent → FOREGROUND_EXIT; the page
  stays mounted (no redraw needed).
- `rebuildPageContainer` without `menuObject` clears our items – always send it.

## Storage
- Only `bridge.setLocalStorage/getLocalStorage` persists reliably.
  Browser localStorage / IndexedDB are unreliable in the WebView.

## Submission
- Greyscale icon + background, privacy policy covering every permission,
  every declared permission must be used, name without "Even",
  must work with the phone locked, no bundled API keys, `min_sdk_version` ≥ 0.0.14.
