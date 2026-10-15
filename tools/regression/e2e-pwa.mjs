/* تست PWA / Service Worker:  node e2e-pwa.mjs <projectRoot> */
import fs from "node:fs"; import {createRequire} from "node:module"; const {chromium} = createRequire(import.meta.url)("playwright");
import {startServer, manifestFor} from "./e2e-lib.mjs";
const root = process.argv[2], raw = fs.readFileSync(new URL("./raw-1520.json", import.meta.url));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  ✓ " : "  ✗ ") + m); };
const srv = await startServer(root); srv.overrides.set("/data/1520.xlsx", {body: raw}); srv.overrides.set("/data/manifest.json", {body: manifestFor({main: {file: "./1520.xlsx", body: raw, version: "t"}})});
const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 1100, height: 800}, locale: "fa-IR"}), page = await ctx.newPage(), errs = [];
page.on("pageerror", e => errs.push(e.message));
const ready = () => page.waitForFunction(() => document.querySelector("#yearDays")?.textContent.trim() !== "—" && document.querySelector("#mapContainer .map-dashboard"), null, {timeout: 20000});

console.log("P1  نصب و فعال‌سازی");
await page.goto(srv.url + "/index.html"); await ready();
await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, {timeout: 15000});
ok(true, "Service Worker نصب و فعال شد");
const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const m = await (await fetch(l.href)).json(); return {n: m.name, d: m.display, icons: m.icons.length, dir: m.dir}; });
ok(man.d === "standalone" && man.icons === 3 && man.dir === "rtl", "manifest.webmanifest معتبر است (" + JSON.stringify(man) + ")");
const icons = await page.evaluate(async () => Promise.all(["icon-192", "icon-512", "icon-maskable-512", "apple-touch-icon"].map(async n => (await fetch("./icons/" + n + ".png")).status)));
ok(icons.every(s => s === 200), "آیکون‌ها در دسترس‌اند");
const cached = await page.evaluate(async () => { const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname); return o; });
const all = Object.values(cached).flat();
ok(all.some(p => p.endsWith("/js/app.js")) && all.some(p => p.endsWith("/dashboards/finance.js")) && all.some(p => p.endsWith("/fonts/Vazirmatn.woff2")), "پوستهٔ برنامه (از جمله ماژول‌های Lazy و فونت) Precache شد (" + all.length + " فایل)");
ok(!all.some(p => /^\/data\//.test(p) || /\.xlsx$/.test(p)), "هیچ فایل داده‌ای (Excel / manifest.json) در Cache Storage نیست");

console.log("P2  آفلاین (بعد از یک بار باز شدن)");
await page.reload(); await ready(); const online = await page.innerText("#mapContainer");
await ctx.setOffline(true); srv.resetLog();
await page.reload(); await ready();
ok(await page.innerText("#mapContainer") === online, "آفلاین: برنامه بالا آمد و خروجی با حالت آنلاین یکسان است");
ok((await page.innerText("#yearDays")).includes("۱۹۵"), "آفلاین: روز سپری‌شده از سال درست است (داده از IndexedDB)");
for (const v of ["finance", "anomaly", "report", "analytics"]) { await page.click(`.ribbon-item[data-view=${v}]`); await page.waitForTimeout(700); ok((await page.innerText("#viewContainer")).length > 200, `آفلاین: تب ${v} (ماژول Lazy از Cache) رندر شد`); }
await ctx.setOffline(false);

console.log("P3  کد تازه و داده تازه (Cache قدیمی نمی‌ماند)");
srv.overrides.set("/css/dashboard.css", {body: "/* NEW-CSS-MARKER */"});
await page.reload(); await ready();
ok(await page.evaluate(async () => (await (await fetch("./css/dashboard.css")).text()).includes("NEW-CSS-MARKER")), "فایل کد عوض شد → نسخهٔ جدید گرفته می‌شود (network-first)");
srv.resetLog(); const before = srv.log.length;
await page.evaluate(() => fetch("./data/manifest.json")); await page.evaluate(() => fetch("./data/1520.xlsx", {method: "HEAD"}));
ok(srv.count(/\/data\/manifest\.json/) >= 1 && srv.count(/\/data\/1520\.xlsx/) >= 1, "درخواست‌های data/ مستقیم به شبکه می‌روند (SW دخالت نمی‌کند)");
const after = await page.evaluate(async () => { const o = []; for (const k of await caches.keys()) o.push(...(await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname)); return o; });
ok(!after.some(p => /^\/data\//.test(p)), "بعد از چند بار استفاده هم داده‌ای Cache نشده است");
ok(errs.length === 0, "خطای JS: " + errs.length + " " + errs.slice(0, 2));
console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
