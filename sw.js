/* Offline support, so the game works in the car and on a plane.
 *
 * Cache-first, because none of this changes between deploys except when it
 * does -- and then the cache name changes with it. Bump CACHE on every deploy
 * that ships new files; the old one is deleted on activate, so a stale copy
 * can never outlive a release. Without that bump a service worker will happily
 * serve last week's game for ever.
 */
const CACHE = 'sudoku-steps-v3';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/levels.js',
  './js/generator.js',
  './js/audio.js',
  './js/game.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names
          .filter(function (n) { return n !== CACHE; })
          .map(function (n) { return caches.delete(n); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  // Navigations go to the network first, so a new deploy is picked up as soon
  // as there is a connection, and fall back to the cached page when there is
  // not. Everything else is served from the cache and refreshed behind the
  // scenes -- it is all small, and instant beats current for a game.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          return res;
        })
        .catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      const fresh = fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || fresh;
    })
  );
});
