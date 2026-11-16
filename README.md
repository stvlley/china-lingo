# China Lingo · 供应链中文

A gamified, installable (PWA) Mandarin trainer built for dealing with Chinese suppliers, factories and manufacturers, plus survival phrases for emergencies and day-to-day life.

## What's inside

- **11 units, ~130 phrases**: survival basics, numbers & money, meeting suppliers, quotes & samples, negotiation, quality control, shipping & payment, factory visits, emergencies, getting around, banquets & guanxi.
- **Lesson types**: new-phrase cards, pick the Mandarin, pick the meaning, listening, sentence building with word tiles, and match-the-pairs.
- **Game loop**: hearts (refill every 30 min), gems, XP and levels, day streaks with streak freezes, combo banners, crowns (up to Legendary), unit chests, daily quests, 15 achievements, and an end-of-lesson celebration sequence.
- **Feedback**: Web Audio sound effects, haptics (Android vibration; iOS 18+ system taps), Mandarin text-to-speech, confetti, and an original mascot (Bāo 包, the shipping box).
- **SOS tab**: China emergency numbers, emergency phrases, and a "show to driver" address card.
- **PWA**: installable, works offline, update banner when a new version ships, home-screen shortcuts (SOS, Practice, Phrasebook).

## Project layout

```
index.html              app shell
css/app.css             styles (safe-area aware)
js/data.js              all phrase content: edit here to add phrases or units
js/fx.js                sound, haptics and speech engine
js/app.js               app logic, lessons, gamification
js/pwa.js               install prompt, service worker registration, updates
sw.js                   service worker (offline cache)
manifest.webmanifest    PWA manifest
icons/ fonts/           static assets (fonts self-hosted for offline use)
```

No build step. Any static host works.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers need `http://localhost` or HTTPS; opening the file directly skips offline mode.

## Deploy

`.github/workflows/pages.yml` deploys to GitHub Pages on every push to `main`. Enable it once in **Settings → Pages → Build and deployment → Source: GitHub Actions**.

When you ship a change, bump `VERSION` in `sw.js` (and `APP_VERSION` in `js/app.js`) so installed apps pick up the update and show the "new version" banner.

## Sound & haptics notes

- Audio unlocks on your first tap (browsers require a gesture).
- iPhone: "Play sounds in silent mode" (Me tab) uses `navigator.audioSession` (iOS 17+) so effects play with the ring switch off. Turn it off if you want effects to respect the switch and not pause your music.
- iPhone haptics need iOS 18+ (Safari has no Vibration API; the app uses the system switch-control tap). Android uses `navigator.vibrate`.
- Pronunciation uses the device's built-in Chinese voice. For best quality on iPhone: Settings → Accessibility → Spoken Content → Voices → Chinese (China mainland) → download an Enhanced/Premium voice.

## Adding content

Each phrase in `js/data.js` is `["chunked hanzi", "pinyin", "English", "optional tip"]`. Spaces in the hanzi define the word tiles used in sentence-building exercises.
