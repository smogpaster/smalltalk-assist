# SmallTalk Assist – notes for Claude

Even Hub app for Even Realities G2 glasses: live transcription of a
conversation plus short small-talk suggestions on the glasses. BYOK (users
bring their own STT and LLM keys). Released on Even Hub as
`com.smogpaster.smallbig`; README.md describes features and architecture.

## Working with the owner

- The owner (Smogpaster) writes German: answer in German. Code, comments,
  commits and docs in English.
- Ask instead of assuming. Never invent SDK or provider APIs; check the SDK
  typings in `node_modules/@evenrealities/even_hub_sdk` and provider docs.
- Ask before introducing any server or hosted service.
- Work in small steps and summarize what changed and what to test on the device.

## Hard rules

- API keys: stored locally only, sent only to their own provider, never logged.
- No conversation content (transcripts, suggestions) in logs or the diagnostics trace.
- No analytics. Nothing bundled that is secret.
- Network access is limited to the `app.json` whitelist (exact origins, fixed at
  pack time); `tests/manifest.test.ts` keeps it in sync with the adapters.
  A new provider needs a whitelist entry and a privacy-policy update
  (`docs/privacy-policy.*.md`, published via GitHub Pages from `/docs`).
- Released versions are immutable: any change after release needs a version
  bump in `app.json` and `package.json`.

## Commands

```bash
npm ci
npm test            # vitest
npm run typecheck
npm run build
npm run pack        # dist/ + smalltalk-assist.ehpk (gitignored)
```

`npm run dev:device` / `npm run qr` / `npm run simulate` need the owner's Mac
(LAN QR code for the phone, desktop simulator); they do not work in a cloud
session. Hardware tests are always done by the owner.

## Platform pitfalls

Read `docs/platform-notes.md` before touching audio, display, input, timers or
networking. The most important ones:

- `requestAnimationFrame` never fires while the WebView is hidden; the SDK
  throttles timers to ~1 s in the background.
- Hot reload restarts the app on the phone (looks like a crash) – hence
  `dev:device` without HMR.
- Root-page double tap must call `shutDownPageContainer(1)`.
- The contextual menu gesture arrives on the device as a bare long press, so
  long press has no binding of its own.
- An Even Hub app cannot open the system browser: external links are shown
  with copy button + QR code (`src/ui/supportCard.ts`).
