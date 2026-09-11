/* AnimRu — service worker: оффлайн-оболочка.
   Статика кэшируется, запросы к API и видео идут мимо кэша. */
var CACHE = 'animru-v5';
var SHELL = [
  './',
  './index.html',
  './style.css?v=5',
  './config.js?v=5',
  './db.js?v=5',
  './gamify.js?v=5',
  './app.js?v=5',
  './auth.js?v=5',
  './social.js?v=5',
  './extras.js?v=5',
  './manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  var sameOrigin = url.origin === self.location.origin;
  var isMedia = /\.(m3u8|ts|mp4)(\?|$)/.test(url.pathname) || url.hostname.indexOf('libria') !== -1;
  if (!sameOrigin || isMedia) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return cached || caches.match('./index.html');
      });
      return cached || network;
    })
  );
});
