/* Hedra V6.4 – Service Worker (core cache + offline fallback) */
const CACHE="hedra-v6-4-rebuild-"+(new Date().toISOString().slice(0,10)).replaceAll("-","");

const SCOPE = self.registration.scope;
const CORE = [
  new URL("./", SCOPE).pathname,
  new URL("./index.html", SCOPE).pathname,
  new URL("./app.css", SCOPE).pathname,
  new URL("./app.js", SCOPE).pathname,
  new URL("./unlock.js", SCOPE).pathname,
  new URL("./printpro.js", SCOPE).pathname,
  new URL("./manifest.json", SCOPE).pathname,
  new URL("./icon.png", SCOPE).pathname
];

self.addEventListener("install", (e)=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(CORE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate",(e)=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",(e)=>{
  const req=e.request;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;

  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);

    // cache-first for core
    if(req.method==="GET" && CORE.includes(url.pathname)){
      const cached=await cache.match(req);
      if(cached) return cached;
      const fresh=await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    }

    // network-first others
    try{
      const fresh=await fetch(req);
      if(req.method==="GET") cache.put(req, fresh.clone());
      return fresh;
    }catch(_){
      const cached=await cache.match(req);
      if(cached) return cached;
      if(req.mode==="navigate"){
        const fallback=await cache.match(new URL("./index.html", SCOPE).pathname);
        return fallback || new Response("Offline",{status:503});
      }
      return new Response("Offline",{status:503});
    }
  })());
});
