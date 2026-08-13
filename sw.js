/* Offline support, so the game works in the car and on a plane.
 *
 * Cache-first, because none of this changes between deploys except when it
 * does -- and then the cache name changes with it. Bump CACHE on every deploy
 * that ships new files; the old one is deleted on activate, so a stale copy
 * can never outlive a release. Without that bump a service worker will happily
 * serve last week's game for ever.
 */
const CACHE = 'sudoku-steps-v5';

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
      .then(function (c) {
        // cache: 'reload' goes past the browser's own HTTP cache. Without it a
        // brand new cache can be filled with the bytes of the release before
        // it -- the browser serves its stale copy quite happily, and nothing
        // ever re-fetches afterwards, so the app pins itself to the old
        // version for good. Pages sends max-age=600, so the window for that is
        // ten minutes after every deploy.
        return c.addAll(SHELL.map(function (u) {
          return new Request(u, { cache: 'reload' });
        }));
      })
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
  if (new URL(e.request.url).origin !== self.location.origin) return;

  // One release is served whole, or not at all. Fetching the page from the
  // network while the scripts still come from the cache would mix a new page
  // with the previous release's code -- which is how a service worker breaks
  // an app outright, rather than merely leaving it a version behind. A new
  // release arrives when the new worker installs, and then all of it does.
  const key = e.request.mode === 'navigate' ? './index.html' : e.request;

  e.respondWith(
    caches.match(key).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(key, copy); });
        }
        return res;
      });
    })
  );
});
