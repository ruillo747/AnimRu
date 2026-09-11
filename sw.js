/* AnimRu service worker: оболочка доступна офлайн, медиа никогда не кэшируется. */

const CACHE = 'animru-v8'

const SHELL = [
  './',
  'index.html',
  'style.css?v=8',
  'config.js?v=8',
  'db.js?v=8',
  'gamify.js?v=8',
  'app.js?v=8',
  'auth.js?v=8',
  'social.js?v=8',
  'extras.js?v=8',
  'kodik.js?v=8',
  'manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function isMedia(url) {
  if (/\.(m3u8|ts|mp4|vtt|srt)$/i.test(url.pathname)) return true
  return url.hostname.includes('libria') || url.hostname.includes('kodik')
}

/* Сначала сеть, кэш — только запасной вариант. Иначе обновлённые стили не доезжают до браузера. */
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.origin !== self.location.origin) return
  if (isMedia(url)) return

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches
            .open(CACHE)
            .then((cache) => cache.put(req, copy))
            .catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  )
})
