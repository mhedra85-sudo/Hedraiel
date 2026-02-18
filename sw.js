// Hedra V6.2 PRO – Service Worker (cache-first core + offline fallback)
const CACHE="hedra-v6-3-printpro-"+(new Date().toISOString().slice(0,10)).replaceAll("-","");

const SCOPE = self.registration.scope; // e.g. https://user.github.io/Hedra/
const CORE = [
  new URL("./", SCOPE).pathname,
  new URL("./index.html", SCOPE).pathname,
  new URL("./manifest.json", SCOPE).pathname,
  new URL("./icon.png", SCOPE).pathname
];

self.addEventListener("install", (e) => {
  e.waitUntil((async()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if(e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;

  e.respondWith((async()=>{
    const cache = await caches.open(CACHE);
    const isCore = CORE.includes(url.pathname);

    if(req.method === "GET" && isCore){
      const cached = await cache.match(req);
      if(cached) return cached;
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    }

    try{
      const fresh = await fetch(req);
      if(req.method==="GET") cache.put(req, fresh.clone());
      return fresh;
    }catch(_){
      const cached = await cache.match(req);
      if(cached) return cached;
      if(req.mode==="navigate"){
        const fallback = await cache.match(new URL("./index.html", SCOPE).pathname);
        return fallback || new Response("Offline",{status:503});
      }
      return new Response("Offline",{status:503});
    }
  })());
});
