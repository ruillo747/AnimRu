/* AnimRu service worker: оболочка доступна офлайн, потоковое видео не кэшируется,
   но специально скачанные серии отдаются из отдельного кэша.

   Важно: в SHELL держим URL БЕЗ строки запроса (?v=...), а при поиске в кэше
   используем ignoreSearch. Иначе версия в index.html и версия здесь расходятся,
   предзагруженные файлы никогда не отдаются, а офлайн-оболочка ломается. */

const CACHE = 'animru-v21'
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
  'manifest.webmanifest',
]

/* addAll падает целиком, если хотя бы один файл недоступен, поэтому кэшируем поштучно */
async function precache() {
  const cache = await caches.open(CACHE)
  await Promise.all(
    SHELL.map((url) =>
      cache.add(url).catch(() => {
        /* отсутствующий файл не должен ломать установку */
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

/* ищем в кэше оболочки, не обращая внимания на ?v=... */
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
    const hit = await fromShell(req)
    if (hit) return hit
    const shell = await caches.match('index.html', { ignoreSearch: true })
    return shell || Response.error()
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
