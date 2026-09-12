/* AnimRu service worker: оболочка доступна офлайн, потоковое видео не кэшируется,
   но специально скачанные серии отдаются из отдельного кэша. */

const CACHE = 'animru-v11'
const OFFLINE = 'animru-offline'

const SHELL = [
  './',
  'index.html',
  'style.css?v=9',
  'config.js?v=9',
  'db.js?v=9',
  'gamify.js?v=9',
  'app.js?v=9',
  'auth.js?v=9',
  'social.js?v=9',
  'extras.js?v=9',
  'kodik.js?v=9',
  'offline.js?v=11',
  'schedule.js?v=11',
  'kodik-browse.js?v=11',
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
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== OFFLINE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

function isMedia(url) {
  if (/\.(m3u8|ts|mp4|vtt|srt)$/i.test(url.pathname)) return true
  return url.hostname.includes('libria') || url.hostname.includes('kodik')
}

async function fromOffline(req) {
  try {
    const cache = await caches.open(OFFLINE)
    return await cache.match(req, { ignoreVary: true })
  } catch {
    return undefined
  }
}

async function shellFirst(req) {
  try {
    const res = await fetch(req)
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone()
      caches
        .open(CACHE)
        .then((cache) => cache.put(req, copy))
        .catch(() => {})
    }
    return res
  } catch {
    const hit = await caches.match(req)
    return hit || (await caches.match('index.html')) || Response.error()
  }
}

async function handle(req, url) {
  /* скачанные сегменты, плейлисты и ответы API отдаём сразу из офлайн-кэша */
  const saved = await fromOffline(req)
  if (saved) return saved

  if (url.origin !== self.location.origin || isMedia(url)) return fetch(req)
  return shellFirst(req)
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

  event.respondWith(handle(req, url))
})
