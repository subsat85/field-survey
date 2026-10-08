/* Service Worker — مسح ميداني
 * - الصدفة (index/manifest/icons) في كاش مُرقَّم بالإصدار؛ المكتبات الخارجية في كاش مستقل لا يُحذف عند تحديث التطبيق.
 * - التثبيت لا يفشل أبداً: كل ملف يُخزَّن على حدة (فشل مكتبة واحدة لا يُسقط التطبيق الأساسي).
 * - لا يخزّن سوى ملفات التطبيق ومكتبات cdnjs. لا يلمس بيانات المستخدم إطلاقًا.
 */
const VERSION = "v13";
const SHELL = "field-survey-shell-" + VERSION;
const LIBS  = "field-survey-libs-v1";
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png"];
const LIB_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"
];
const NET_TIMEOUT = 6000;
const OFFLINE_HTML = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>مسح ميداني</title></head><body style="font-family:system-ui,sans-serif;background:#fff;color:#17304f;padding:32px 20px;line-height:1.9;text-align:center">' +
  '<h2>التطبيق غير محمّل على هذا الجهاز بعد</h2><p>يلزم اتصال بالإنترنت <b>مرة واحدة</b> لفتح التطبيق، وبعدها يعمل بدون إنترنت.</p>' +
  '<p>بياناتك المحفوظة على الجهاز لم تتأثر.</p><button onclick="location.reload()" style="min-height:44px;padding:10px 24px;font-size:16px;border-radius:12px;border:1px solid #1f5fa8;background:#1f5fa8;color:#fff">إعادة المحاولة</button></body></html>';

const abs = u => new URL(u, self.location).href;

async function putOk(cache, req, res) {
  try { if (res && res.ok && (res.type === "basic" || res.type === "cors")) await cache.put(req, res.clone()); } catch (e) {}
}
async function addOne(cache, url, force) {
  const a = abs(url);
  try {
    if (!force && await cache.match(a)) return true;
    const res = await fetch(new Request(a, { cache: "reload" }));
    if (res && res.ok) { await cache.put(a, res.clone()); return true; }
  } catch (e) {}
  return false;
}
function fetchWithTimeout(req, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(req, { signal: ctl.signal }).finally(() => clearTimeout(t));
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    try {
      const shell = await caches.open(SHELL);
      await Promise.all(CORE.map(u => addOne(shell, u, true)));
      const libs = await caches.open(LIBS);
      await Promise.all(LIB_URLS.map(u => addOne(libs, u, false)));
    } catch (err) { /* التثبيت لا يفشل */ }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.indexOf("field-survey-") === 0 && k !== SHELL && k !== LIBS).map(k => caches.delete(k)));
    } catch (err) {}
    await self.clients.claim();
  })());
});

async function shellFirstNetwork(req) {
  const cache = await caches.open(SHELL);
  try {
    // نتحقق من الخادم دائماً (يتجاوز كاش GitHub لمدة 10 دقائق)، مع مهلة كي لا يعلق التطبيق على شبكة ضعيفة
    const res = await fetchWithTimeout(new Request(req.url, { cache: "no-cache", credentials: "same-origin" }), NET_TIMEOUT);
    if (res.ok) { await putOk(cache, req, res); return res; }
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || res;                       // خطأ خادم (404/5xx): نفضّل النسخة السليمة المخزّنة، ولا نخزّن الخطأ
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match(abs("./index.html")) : undefined);
    if (hit) return hit;
    if (req.mode === "navigate") return new Response(OFFLINE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    return Response.error();
  }
}

async function libCacheFirst(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetchWithTimeout(new Request(req.url, { mode: "cors" }), 15000);   // cdnjs يدعم CORS
    if (res.ok) { await putOk(cache, req.url, res); return res; }
    return res;
  } catch (err) {
    try { return await fetch(req); } catch (e2) { return Response.error(); }
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) { e.respondWith(shellFirstNetwork(req)); return; }
  if (u.hostname === "cdnjs.cloudflare.com") { e.respondWith(libCacheFirst(req)); return; }
  // الخرائط (OSM/Esri) وأي مصدر خارجي آخر: لا تدخّل
});
