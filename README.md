# Zarządzanie domem (Household Management)

An HTML/CSS/JS web app with four sections, sharing one login and one
Firebase backend:

- **Płatności** (Payments) — recurring bill tracking with reminders
- **Lista zakupów** (Shopping list) — two simple checklists, "Ogólne" and
  "Co miesięczne"
- **Składzik** (Pantry) — home inventory with type categories and a
  totals overview
- **Wywóz śmieci** (Trash collection) — a calendar of pickup dates with
  reminders the day before

Installable as a PWA, no build step, backed by Firebase so anyone logged
in with the household password sees the same live data.

## Płatności (Payments)

- Add/edit/delete recurring payments (name, amount, due day)
- Set frequency per payment: every month, or every 2 months
- Assign each payment to "Paweł", "Marta", or "Ogólne" — filter the list
  and calendar by person using the chips above the view
- Pick the due day from a 1–31 grid picker instead of typing a number
- Notes field for account/company details (e.g. "mBank ...1234")
- Calendar view: a full month grid showing every bill on its due date
  (only shown in months it's actually due, for every-2-months bills)
- See at a glance which bills are overdue, due soon, or paid
- Mark a bill as paid for its current cycle
- Amounts shown in PLN
- Browser notifications, checked hourly and whenever the tab regains focus

Note: a monthly bill is due every month on its chosen day. A bi-monthly
("every 2 months") bill is anchored to the month you created it (or the
month you last changed its frequency) and recurs every 2 months from
there.

## Lista zakupów (Shopping list)

- Two independent checklists: "Ogólne" (general) and "Co miesięczne"
  (monthly recurring shopping)
- Add an item, check it off, delete it, or reorder it — drag the ⠿ handle
  with mouse or finger, or use the ▲/▼ buttons
- "Co miesięczne" items also get a type: Dom, Kaziczek, Rosa, or Inne —
  the list is presented grouped under those headings, and the ▲/▼ buttons
  move an item within its own type group rather than the whole list
- The header count shows how many unchecked items remain across both lists
- No notifications for this section

## Składzik (Pantry)

- Add items you have in storage: name, amount, a free-text unit
  (e.g. "kg", "szt", "opak."), and a type category
- Type categories: puszka/ki (cans), mąka/ki (flour), makaron/ny (pasta),
  butelka/ki (bottles), słoik/ki (jars), paczka/ki (packages)
- Edit or delete any entry
- "Podsumowanie" (overview) tab groups entries first by type category,
  then by matching name + unit within that type, showing a summed total —
  e.g. if you've logged flour three separate times, it shows one combined
  total under the "mąka/ki" heading rather than three separate lines
- No notifications for this section (items don't have due dates)

## Wywóz śmieci (Trash collection)

- Add collection dates with a type: BIO (brown), Zmieszane/mixed (grey),
  or Segregowane/sorted (yellow)
- "Upcoming" list shows all dates sorted, with past ones dimmed
- Calendar view shows every date as a color-coded pill, with prev/next
  month navigation
- Browser notification the day before a collection date
- Dates are entered and edited manually in the app — there's no automatic
  municipal calendar lookup, so keep it updated as your local schedule
  changes (e.g. holidays shifting pickup days)

## Shared login

All three sections sit behind one shared household password (Firebase
Authentication, Email/Password).

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
   per person; the "Assigned to" field in the Płatności section is just
   a label, not a real per-user permission system.

To change the password later, go to Authentication → Users, find that
one user, and reset its password from the console.

### Database rules

```json
{
  "rules": {
    "payments": { ".read": "auth != null", ".write": "auth != null" },
    "paidStatus": { ".read": "auth != null", ".write": "auth != null" },
    "pantry": { ".read": "auth != null", ".write": "auth != null" },
    "trash": { ".read": "auth != null", ".write": "auth != null" },
    "shopping": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

Paste this into Firebase console → Realtime Database → Rules → Publish.
Only someone logged in with the household password can read or write any
of the app's data, and these rules don't expire.

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

**Requires an internet connection.** All data lives in Firebase, so the
app needs network access to load or save anything. The service worker
still caches the app's own files for fast loading, but the data itself
won't load without a connection.

If you want reminders that work even with everything closed, the desktop
(Electron) or mobile (Expo) versions of the Płatności section handle that
natively — worth asking for if this matters to you.

## Project structure

```
index.html          # App markup: login screen + 3 sections
style.css            # Styling
app.js               # All app logic: auth, storage, rendering, notifications
manifest.json        # PWA manifest (name, icons, install behavior)
service-worker.js    # Offline caching of the app's own files
```

## Customizing

- **Check frequency**: change `60 * 60 * 1000` in `app.js` (`init` function).
- **Payment notification lead time default**: change the `2` in `daysBefore ?? 2`.
- **Trash notification lead time**: currently fixed at 1 day before
  (`d === 1` in `checkTrashNotify`) — change that condition to adjust.
- **Icons**: add your own `icon-192.png` / `icon-512.png` next to
  `manifest.json` for a custom app icon when installed (any square PNGs
  work — the manifest already references these filenames).
