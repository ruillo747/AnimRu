/* AnimRu service worker: оболочка доступна офлайн, потоковое видео не кэшируется,
   но специально скачанные серии отдаются из отдельного кэша. */
const CACHE = 'animru-v34'
const OFFLINE = 'animru-offline'
const SHELL = ['./','index.html','style.css','config.js','db.js','gamify.js','app.js','auth.js','social.js','extras.js','kodik.js','polish.js','kodik-net.js','mobile-nav.js','unified-catalog.js','mobilefix.js','offline.js','schedule.js','kodik-browse.js','catalog.js','player-plus.js','manifest.webmanifest']
async function precache(){const cache=await caches.open(CACHE);await Promise.all(SHELL.map((url)=>cache.add(url).catch(()=>{})))}
self.addEventListener('install',(event)=>event.waitUntil(precache().then(()=>self.skipWaiting())))
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE&&key!==OFFLINE).map((key)=>caches.delete(key)))).then(()=>self.clients.claim())))
function isMedia(url){return /\.(m3u8|ts|mp4|vtt|srt)$/i.test(url.pathname)||url.hostname.includes('libria')||url.hostname.includes('kodik')}
async function fromOffline(req){try{return await(await caches.open(OFFLINE)).match(req,{ignoreVary:true})}catch{return undefined}}
async function fromShell(req){try{return await(await caches.open(CACHE)).match(req,{ignoreSearch:true,ignoreVary:true})}catch{return undefined}}
async function shellFirst(req){
  try{
    /* cache:no-store не даёт HTTP-кэшу GitHub Pages вернуть старый JS под тем же URL. */
    const response=await fetch(req,{cache:'no-store'})
    if(response&&response.ok&&response.type==='basic')caches.open(CACHE).then((cache)=>cache.put(req,response.clone())).catch(()=>{})
    return response
  }catch{
    const hit=await fromShell(req)
    if(hit)return hit
    if(req.mode==='navigate')return(await caches.match('index.html',{ignoreSearch:true}))||Response.error()
    return Response.error()
  }
}
async function handle(req,url){const saved=await fromOffline(req);if(saved)return saved;if(url.origin!==self.location.origin||isMedia(url))return fetch(req);return shellFirst(req)}
self.addEventListener('fetch',(event)=>{const req=event.request;if(req.method!=='GET')return;let url;try{url=new URL(req.url)}catch{return}if(url.protocol!=='http:'&&url.protocol!=='https:')return;event.respondWith(handle(req,url))})
