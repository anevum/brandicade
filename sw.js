/* App-shell caching only. Network-first HTML, offline fallback; no tracking. */
const CACHE='brandicade-app-v1.0.1';
const ASSETS=['/','/index.html','/src/styles.css','/src/app.mjs','/src/engine.mjs','/src/progression.mjs','/assets/atrium.svg','/assets/mark.svg','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/icon-1024.png','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(res=>{if(res.ok){const copy=res.clone();void caches.open(CACHE).then(c=>c.put('/index.html',copy));}return res;}).catch(()=>caches.match('/index.html')));return;}
 event.respondWith(caches.match(event.request).then(cache=>cache||fetch(event.request).then(res=>{if(res.ok){const copy=res.clone();void caches.open(CACHE).then(c=>c.put(event.request,copy));}return res;})));
});
