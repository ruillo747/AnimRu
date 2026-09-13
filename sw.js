/* AnimRu service worker: оболочка доступна офлайн, потоковое видео не кэшируется,
   но специально скачанные серии отдаются из отдельного кэша.

   В SHELL храним URL без ?v= и ищем с ignoreSearch. Версию CACHE нужно
   повышать при любом изменении оболочки, чтобы старые файлы не переживали релиз. */

const CACHE = 'animru-v26'
const OFFLINE = 'animru-offline'

const SHELL = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'db.js',
  'gamify.js',
  'app.js',
  'auth.js',
  'social.js',
  'extras.js',
  'kodik.js',
  'polish.js',
  'kodik-net.js',
  'mobilefix.js',
  'offline.js',
  'schedule.js',
  'kodik-browse.js',
  'catalog.js',
  'player-plus.js',
  'manifest.webmanifest',
]

async function precache() {
  const cache = await caches.open(CACHE)
  await Promise.all(
    SHELL.map((url) =>
      cache.add(url).catch(() => {
        /* Один необязательный файл не должен отменять установку целиком. */
      }),
    ),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE && key !== OFFLINE).map((key) => caches.delete(key))),
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

async function fromShell(req) {
  try {
    const cache = await caches.open(CACHE)
    return await cache.match(req, { ignoreSearch: true, ignoreVary: true })
  } catch {
    return undefined
  }
}

async function shellFirst(req) {
  try {
    const response = await fetch(req)
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone()
      caches
        .open(CACHE)
        .then((cache) => cache.put(req, copy))
        .catch(() => {})
    }
    return response
  } catch {
    const hit = await fromShell(req)
    if (hit) return hit

    /* index.html допустим только как fallback документа. Возврат HTML вместо
       CSS/JS создавал ложный MIME type и скрывал настоящую сетевую ошибку. */
    if (req.mode === 'navigate') {
      const shell = await caches.match('index.html', { ignoreSearch: true })
      if (shell) return shell
    }
    return Response.error()
  }
}

async function handle(req, url) {
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
