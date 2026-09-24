# Even Hub submission checklist – SmallTalk Assist

Based on hub.evenrealities.com/docs/ship/app-submission (checked 2026-09-24).

## Before packing

- [ ] `app.json`: version bumped (semver, no suffix), `min_sdk_version` 0.0.16 (floor 0.0.14), `min_app_version` 2.2.10
- [ ] Name "SmallTalk Assist" (16 chars, no "Even") – same on glasses and portal
- [ ] Every permission is used: `g2-microphone` (default mic), `phone-microphone` (selectable), `network` (whitelist = provider origins; `tests/manifest.test.ts` checks it matches the adapters)
- [ ] No API keys in the bundle (keys are entered by users at runtime; `.env*` unused)
- [ ] `npm test` and `npm run typecheck` green

## Package

```bash
npm run pack                       # build + evenhub pack → smalltalk-assist.ehpk
npx evenhub login                  # once
npx evenhub pack app.json dist -o smalltalk-assist.ehpk -c   # also checks package id availability
```

## On the device (beta testing)

- [ ] Install via beta testing (not QR), first start shows the phone onboarding; the glasses say "finish setup on the phone"
- [ ] Root-page double tap opens the system exit dialog; "Yes" closes the app, "No" keeps it running
- [ ] Lock the phone for 5 minutes during a demo conversation → still responsive, suggestions keep coming
- [ ] Idle 2 minutes → still responsive
- [ ] Start Conversate or Navigate afterwards without restarting the glasses
- [ ] Contextual menu: items work; "← Zurück" only closes the menu
- [ ] Live test with each STT provider you want to advertise (Speechmatics: temporary keys may need an enterprise account)

## Portal

- [ ] Icon foreground `store/icon-foreground.png`, background `store/icon-background.png` (greyscale)
- [ ] Background image `store/background.png` (greyscale)
- [ ] Screenshots from `store/screenshots/` (simulator captures)
- [ ] Description, tagline, release notes per language from `docs/store-listing.md`
- [ ] Privacy policy URL: https://smogpaster.github.io/smalltalk-assist/privacy-policy.en.html (German: `privacy-policy.de.html`), GitHub Pages from `/docs`; reviewed, covers every permission
- [x] Tip link set in `src/support.ts` (https://ko-fi.com/smogpaster)
- [ ] Release notes: 1–3 lines, describe what the app does (first release)
