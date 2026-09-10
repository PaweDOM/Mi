# Payment Reminders (Web)

An HTML/CSS/JS web app that tracks your monthly bills and reminds you
before they're due — installable as a PWA, no build step, and now backed
by a shared Firebase database so anyone with the site open sees the same
live data (e.g. you and a partner).

## Features

- Add/edit/delete recurring payments (name, amount, due day)
- Set frequency per payment: every month, or every 2 months
- Assign each payment to "Paweł", "Marta", or "Ogólne" — filter the list
  and calendar by person using the chips above the view
- Pick the due day from a 1–31 grid picker instead of typing a number
- Notes field for account/company details (e.g. "mBank ...1234")
- Calendar view: a full month grid showing every bill on its due date
  (only shown in months it's actually due, for every-2-months bills), with
  prev/next month navigation, color-coded by status
- See at a glance which bills are overdue, due soon, or paid
- Mark a bill as paid for its current cycle (resets automatically at the
  next occurrence — one month later for monthly bills, two for bi-monthly)
- Amounts shown in PLN
- Amounts shown in PLN
- **Password-protected**: one shared household login gates access to the
  app and the data
- **Shared, live data**: payments and paid status sync through Firebase
  Realtime Database — anyone logged in sees changes from anyone else,
  automatically, no manual refresh needed
- Browser notifications, checked hourly and whenever the tab regains focus
- Installable as a PWA (desktop or mobile) via the browser's "Install app" option

Note: a monthly bill is due every month on its chosen day. A bi-monthly
("every 2 months") bill is anchored to the month you created it (or the
month you last changed its frequency) and recurs every 2 months from
there — so the calendar only shows it every other month.

## Firebase setup

This app expects a Firebase project with **Realtime Database** and
**Authentication (Email/Password)** both enabled. The config is already
embedded at the top of `app.js` (`firebaseConfig`) — if you fork this for
your own project, replace it with your own project's config from the
Firebase console (Project settings → your web app).

### One-time setup for the shared login

1. In Firebase console → Build → Authentication → Sign-in method, enable
   the **Email/Password** provider.
2. In Authentication → Users, click "Add user." Use the email
   `household@payment-reminders.local` (this must match the
   `HOUSEHOLD_EMAIL` constant near the top of `app.js`) and choose
   whatever password you want the household to use.
3. That's it — anyone who knows the password can log in on the app's
   login screen. There's only one shared account, not separate logins
   per person; the "Assigned to" field in the app is just a label, not a
   real per-user permission system.

To change the password later, go to Authentication → Users, find that
one user, and reset its password from the console.

### Database rules

Since the app now requires login, the database rules should require
authentication rather than being fully open:

```json
{
  "rules": {
    "payments": { ".read": "auth != null", ".write": "auth != null" },
    "paidStatus": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

Paste this into Firebase console → Realtime Database → Rules → Publish.
This replaces the earlier fully-open rules and means only someone who has
logged in with the household password can read or write the data —
importantly, these rules don't expire the way Firebase's default test-mode
rules do.

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

## Important limitations

**Notifications only fire while a tab is loaded.** Browsers don't allow
web pages to schedule notifications when the browser itself is fully
closed (that requires the Push API plus a server, which is out of scope
here). If you keep a tab or the installed PWA open, you'll get reminders
reliably (checked hourly and on tab focus). If it's fully closed, you'll
be caught up immediately the next time you open it.

**Requires an internet connection.** Since payment data now lives in
Firebase rather than on-device, the app needs network access to load or
save anything — it's no longer usable fully offline the way the
localStorage-only version was. The service worker still caches the app's
own files for fast loading, but the data itself won't load without a
connection.

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
