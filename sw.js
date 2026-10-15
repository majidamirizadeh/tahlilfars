/* Service Worker — فقط «پوستهٔ برنامه» (HTML/CSS/JS/فونت/آیکن) را برای اجرای آفلاین نگه می‌دارد.
   ⛔ داده هرگز اینجا Cache نمی‌شود: هر درخواست زیر data/ (Excel و manifest.json) اصلاً توسط این SW مدیریت نمی‌شود و مستقیم به شبکه می‌رود.
      داده با hash/version در IndexedDB مدیریت می‌شود (js/data/dataCache.js)، پس Excel قدیمی هرگز «برای همیشه» Cache نمی‌ماند.
   BUILD و PRECACHE را  node tools/build-pwa.mjs  می‌نویسد؛ با هر تغییر فایل‌ها، sw.js هم تغییر می‌کند و مرورگر خودکار آن را به‌روز می‌کند. */
const BUILD = "2df923c75d";
const PRECACHE = [/*__PRECACHE__*/"./","./assets/fars-map-base.png","./css/base.css","./css/components.css","./css/layout.css","./css/print.css","./css/tokens.css","./css/views.css","./fonts/Vazirmatn.woff2","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./index.html","./js/app.js","./js/core/constants.js","./js/core/datasetState.js","./js/core/pwa.js","./js/core/vendor.js","./js/core/yearDay.js","./js/dashboards/analytics.js","./js/dashboards/anomaly.js","./js/dashboards/finance.js","./js/dashboards/map.js","./js/dashboards/overview.js","./js/dashboards/report.js","./js/data/dataCache.js","./js/data/dataLoader.js","./js/data/dataProcessor.js","./js/data/dataRegistry.js","./js/data/dataWorker.js","./js/data/pipeline.js","./js/data/processors/report1520.js","./js/engines/analyticsEngine.js","./js/engines/anomalyEngine.js","./js/engines/financeEngine.js","./js/engines/metrics.js","./js/engines/statistics.js","./js/engines/zeroWatchEngine.js","./js/filters/filters.js","./js/filters/scopeFilters.js","./js/mapContours.js","./js/settings/settings.js","./js/settings/settingsMenu.js","./manifest.webmanifest"];
const SHELL = "shell-" + BUILD, STATIC = "static-" + BUILD, CDN = "cdn-lucide";
const scopeUrl = new URL("./", self.location).href;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, {cache: "reload"}))));   // یک فایل ناموفق نصب را خراب نمی‌کند
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== STATIC && k !== CDN) await caches.delete(k);   // نسخه‌های قدیمی
    await self.clients.claim();
  })());
});

const dataPrefix = new URL("./data/", self.location).href;                // فقط پوشهٔ data/ ریشه (نه js/data/ که کد برنامه است)
const isData = url => url.href.startsWith(dataPrefix);                         // Excel + manifest.json: هرگز دست نزن
const isShell = url => /\.(?:js|css|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/");

/* Network-first با Revalidate (no-cache = شرطی با ETag، ارزان): همیشه آخرین نسخهٔ کد؛ آفلاین → Cache */
async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req, {cache: "no-cache"});
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req, {ignoreSearch: true})) || (req.mode === "navigate" ? await c.match(scopeUrl) || await c.match(scopeUrl + "index.html") : undefined) || Response.error();
  }
}
/* فونت/تصویر/vendor: Cache-first + به‌روزرسانی در پس‌زمینه */
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {                                  // CDN: فقط Lucide (آیکن‌ها در حالت آفلاین)؛ بقیه بدون دخالت
    if (url.hostname === "cdn.jsdelivr.net" && /lucide/.test(url.pathname)) e.respondWith(staleWhileRevalidate(req, CDN));
    return;
  }
  if (!url.href.startsWith(scopeUrl) || isData(url) || url.pathname.endsWith("/sw.js")) return;
  e.respondWith(isShell(url) || req.mode === "navigate" ? networkFirst(req) : staleWhileRevalidate(req, STATIC));
});
