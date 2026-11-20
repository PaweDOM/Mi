// --- Push notifications (Firebase Cloud Messaging) ---
// Handles notifications sent by the Cloud Function while this app is
// closed or in the background. Foreground notifications (app open) are
// still handled by the in-page checkAndNotify/checkTrashNotify logic.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDQqsm2QzuZykRlngOsRmr--IeTGTynZCY",
  authDomain: "payment-reminders-d9e7f.firebaseapp.com",
  databaseURL: "https://payment-reminders-d9e7f-default-rtdb.firebaseio.com",
  projectId: "payment-reminders-d9e7f",
  storageBucket: "payment-reminders-d9e7f.firebasestorage.app",
  messagingSenderId: "57500988928",
  appId: "1:57500988928:web:77894f486bcc48f66acae5",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Zarządzanie domem';
  const body = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, { body });
});

// --- Offline asset caching ---

const CACHE_NAME = 'payment-reminders-v24';
const ASSETS = ['./', './index.html', './style.css', './app.js', './investments.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Najpierw sieć, potem pamięć podręczna: nowa wersja z GitHuba pokazuje się
// od razu po odświeżeniu, a bez internetu aplikacja dalej działa.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
