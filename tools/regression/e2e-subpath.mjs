/* شبیه‌سازی GitHub Pages: پروژه زیر /my-repo/ سرو می‌شود. همهٔ مسیرها (CSS/JS/Worker/Excel/Manifest/فونت/تصویر) باید درست resolve شوند. node e2e-subpath.mjs <projectRoot> */
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import {createRequire} from "node:module"; const {chromium} = createRequire(import.meta.url)("playwright");
import {startServer, XLSX_SHIM, LUCIDE_SHIM, manifestFor} from "./e2e-lib.mjs";
const site = fs.mkdtempSync(path.join(os.tmpdir(), "site-")); fs.cpSync(process.argv[2], path.join(site, "my-repo"), {recursive: true, filter: s => !/node_modules|\.git$/.test(s)});
const raw = fs.readFileSync(new URL("./raw-1520.json", import.meta.url));
const srv = await startServer(site, {shims: false});
srv.overrides.set("/my-repo/vendor/xlsx/xlsx.full.min.js", {body: XLSX_SHIM}); srv.overrides.set("/my-repo/vendor/lucide/lucide.min.js", {body: LUCIDE_SHIM});
srv.overrides.set("/my-repo/data/1520.xlsx", {body: raw}); srv.overrides.set("/my-repo/data/manifest.json", {body: manifestFor({main: {file: "./1520.xlsx", body: raw, version: "x"}})});
const b = await chromium.launch(), p = await (await b.newContext({serviceWorkers: "block"})).newPage(); const errs = [], bad = [];
p.on("console", m => m.type()==="error" && errs.push("console: "+m.text())); p.on("pageerror", e => errs.push(e.message)); p.on("response", r => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });
await p.goto(srv.url + "/my-repo/"); await p.waitForFunction(() => document.querySelector("#yearDays")?.textContent.trim() !== "—" && document.querySelector("#mapContainer .map-dashboard"), null, {timeout: 20000});
for (const v of ["finance", "report", "analytics", "anomaly"]) { await p.click(`.ribbon-item[data-view=${v}]`); await p.waitForTimeout(700); }
const hit = re => srv.log.some(l => re.test(l.path) && !srv.log.some(x => x === null));
const need = [/\/my-repo\/css\/main\.css/, /\/my-repo\/js\/app\.js/, /\/my-repo\/js\/data\/dataWorker\.js/, /\/my-repo\/data\/1520\.xlsx/, /\/my-repo\/data\/manifest\.json/, /\/my-repo\/fonts\/Vazirmatn\.woff2/, /\/my-repo\/dashboards|\/my-repo\/js\/dashboards\/finance\.js/];
let ok = true; for (const n of need) { const h = srv.log.some(l => n.test(l.path)); console.log(h ? "✓" : "✗", n.source); ok &&= h; }
const root404 = srv.log.filter(l => !l.path.startsWith("/my-repo/") && l.path !== "/favicon.ico"); console.log(root404.length ? "✗ درخواست خارج از زیرمسیر: " + root404.map(l => l.path).join(", ") : "✓ هیچ درخواستی خارج از /my-repo/ نرفت");
console.log(bad.length ? "✗ پاسخ‌های خطا: " + bad.join(" | ") : "✓ هیچ پاسخ ۴xx/۵xx وجود ندارد", "| JS errors:", errs.length);
// PWA زیر زیرمسیر: SW باید با scope = /my-repo/ ثبت شود
const pw = await (await b.newContext({serviceWorkers: "allow"})).newPage(); await pw.goto(srv.url + "/my-repo/");
await pw.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, {timeout: 15000});
const scope = await pw.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
const pwaOk = scope.endsWith("/my-repo/"); console.log(pwaOk ? "✓" : "✗", "scope سرویس‌ورکر:", scope); ok &&= pwaOk;
await b.close(); srv.close(); process.exit(ok && !root404.length && !bad.filter(x => !/favicon/.test(x)).length && !errs.length ? 0 : 1);
