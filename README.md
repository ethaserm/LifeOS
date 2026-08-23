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
