# Payment Reminders (Web)

A plain HTML/CSS/JS web app that tracks your monthly bills and reminds you
before they're due — installable as a PWA, works offline, no build step,
no backend.

## Features

- Add/edit/delete recurring monthly payments (name, amount, due day)
- Pick the due day from a 1–31 grid picker instead of typing a number
- Calendar view: a full month grid showing every bill on its due date, with
  prev/next month navigation, color-coded by status
- See at a glance which bills are overdue, due soon, or paid
- Mark a bill as paid for the current month (resets automatically next month)
- Browser notifications, checked hourly and whenever the tab regains focus
- Installable as a PWA (desktop or mobile) via the browser's "Install app" option
- Works offline once loaded, via a small service worker
- All data stored in the browser's localStorage — no account, no server

Note: payments repeat on the same day every month (e.g. "day 15"), not on
a specific one-off date — so the calendar view looks the same pattern each
month except for which bills are marked paid.

## Running it locally

No build tools or dependencies needed. Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL in your browser. (Opening `index.html` directly
as a `file://` URL mostly works too, but the service worker and PWA
install prompt require serving it over `http://` or `https://`.)

## Deploying it for real

Since it's just static files, you can host it anywhere:
- **GitHub Pages**: push this folder to a repo, enable Pages in settings
- **Netlify / Vercel**: drag-and-drop the folder or connect the repo
- **Your own server**: copy the files into any web root (Apache, Nginx, etc.)

## Installing as an app

Once hosted (or running locally over http), open it in Chrome/Edge and
look for the "Install" icon in the address bar, or in Safari on iOS use
"Share → Add to Home Screen." This gives you an app-like window/icon
without any app store.

## Important limitation: notifications only fire while a tab is loaded

Browsers don't allow web pages to schedule notifications to fire when the
browser itself is fully closed (that requires Push API + a backend server
to send the push, which is out of scope for this simple, serverless
version). In practice this means:

- If you keep a tab or the installed PWA open (even in the background),
  you'll get reminders reliably, checked hourly and on tab focus.
- If your browser is fully closed, you won't get a reminder until you
  next open the app — at which point it immediately checks and notifies
  for anything currently due.

If you want reminders that work even with everything closed, the desktop
(Electron) or mobile (Expo) versions handle that natively — worth asking
for if this matters to you.

## Project structure

```
index.html          # App markup
style.css            # Styling
app.js               # All app logic: storage, rendering, notifications
manifest.json        # PWA manifest (name, icons, install behavior)
service-worker.js    # Offline caching
```

## Customizing

- **Check frequency**: change `60 * 60 * 1000` in `app.js` (`init` function).
- **Notification lead time default**: change the `2` in `daysBefore ?? 2`.
- **Icons**: add your own `icon-192.png` / `icon-512.png` next to
  `manifest.json` for a custom app icon when installed (any square PNGs
  work — the manifest already references these filenames).
