# Life OS

One app that tracks everything — body, habits, focus, sleep, money, projects, learning.

Runs as a plain static site: no build step, no npm. Open `index.html` through any web
server and it works.

## Layout

```
index.html        shell
css/style.css     light theme, one accent colour per tab
js/app.js         nav, routing, accent switching, sync chip
js/store.js       localStorage + Firestore sync
js/auth.js        optional Google sign-in
js/ui.js          shared widgets (ring, cards, stats)
js/mod/*.js       one file per tab
sw.js             service worker (installable, opens offline)
```

## Data

Everything renders from localStorage, so it works offline and signed out. Signing in
syncs through Firestore at `users/{uid}/data/{doc}`, matching the format the older
pushup and workout apps already use — both read and write the same documents.

## Running it locally

```bash
python -m http.server 5173
```

Then open http://127.0.0.1:5173.

## Setup still needed

Two optional pieces need accounts, so they're not wired up yet:

**AI on the phone** — deploy `worker/index.js` to Cloudflare Workers (free, no
card). Add two secrets in the Worker's settings: `LLM_KEY` (a Groq or Cerebras
key) and `SHARED_TOKEN` (any long random string). Then paste the Worker URL,
with `?t=<SHARED_TOKEN>` on the end, into the AI tab. On a PC served from
localhost the AI already works through Ollama with no setup.

**Evening reminders and calendar sync** — `.github/workflows/lifeos-cron.yml`
runs hourly but needs repo secrets: `FIREBASE_API_KEY`, `FIREBASE_REFRESH_TOKEN`,
`FIREBASE_UID`, `GOOGLE_ICAL_URL`, and `FCM_SERVER_KEY`. The refresh token and
uid are the same pair stored in JARVIS's `backend/workout_auth.json`.
