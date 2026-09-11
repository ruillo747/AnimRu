/* AnimRu service worker: оболочка офлайн, медиа никогда не кэшируется. */

const CACHE = 'animru-v6'

const SHELL = [
  './',
  'index.html',
  'style.css?v=6',
  'config.js?v=6',
  'db.js?v=6',
  'gamify.js?v=6',
  'app.js?v=6',
  'auth.js?v=6',
  'social.js?v=6',
  'extras.js?v=6',
  'manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
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
  return url.hostname.includes('libria')
}

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
  if (isMedia(url)) return
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => hit || caches.match('index.html'))

      return hit || network
    }),
  )
})
