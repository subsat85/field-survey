const CACHE = "payroll-v1";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "../icon-192.png",
  "../icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("payroll-") && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// الشبكة أولاً ثم النسخة المخزّنة عند انقطاع الإنترنت
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin && u.hostname !== "cdnjs.cloudflare.com") return;
  const req = u.origin === self.location.origin ? new Request(e.request.url, {cache: "no-cache"}) : e.request;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
