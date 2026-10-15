/* سناریوهای Update / Cache / Worker / Lazy Loading روی Chromium واقعی: node e2e-update.mjs <projectRoot> */
import fs from "node:fs"; import {createRequire} from "node:module"; const {chromium} = createRequire(import.meta.url)("playwright");
import {startServer, manifestFor, sha} from "./e2e-lib.mjs";
const root = process.argv[2], raw1 = JSON.parse(fs.readFileSync(new URL("./raw-1520.json", import.meta.url), "utf8"));
const clone = o => JSON.parse(JSON.stringify(o)), buf = o => Buffer.from(JSON.stringify(o));
const V1 = buf(raw1);
const r2 = clone(raw1); r2[0][0] = r2[0][0].replaceAll("1405/07/09", "1405/07/16"); r2[2][6] += 50000000; const V2 = buf(r2);
const V3 = Buffer.from("this is not a workbook ".repeat(30));
const r4 = clone(raw1); r4[1][6] = "ستون-دیگر"; const V4 = buf(r4);
const r5 = clone(raw1); const V5 = buf(r5.slice(0, 2 + Math.floor((r5.length - 2) * 0.4)));
const r6 = clone(raw1); r6[0][0] = "گزارش بدون بازهٔ تاریخ"; const V6 = buf(r6);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  ✓ " : "  ✗ ") + m); };
const srv = await startServer(root); let ver = 0;
const setData = (body, {manifest = true} = {}) => { srv.overrides.set("/data/1520.xlsx", {body});
  srv.overrides.set("/data/manifest.json", manifest ? {body: manifestFor({main: {file: "./1520.xlsx", body, version: "t-" + (++ver)}})} : {status: 404, body: "nf"}); };
const browser = await chromium.launch(), ctx = await browser.newContext({serviceWorkers: "block", viewport: {width: 1100, height: 800}, locale: "fa-IR"});
const errors = []; let workers = 0;
const mk = async c => { const p = await (c || ctx).newPage(); p.on("pageerror", e => errors.push(e.message)); p.on("worker", () => workers++);
  p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text())); return p; };
const loaded = p => p.waitForFunction(() => document.querySelector("#yearDays")?.textContent.trim() !== "—" && document.querySelector("#mapContainer .map-dashboard"), null, {timeout: 20000});
const toast = (p, t) => p.waitForFunction(t => { const e = document.querySelector("#appToast"); return e?.classList.contains("show") && e.textContent.includes(t); }, t, {timeout: 15000});
const idb = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open("dashboard-data"); r.onsuccess = () => { const q = r.result.transaction("datasets").objectStore("datasets").getAll(); q.onsuccess = () => res(q.result.map(x => ({hash: x.hash, records: x.metadata.records}))); }; r.onerror = () => res(null); }));
const txt = async (p, s) => s === "#mapContainer" ? (await p.innerText("#mapContainer")) + "\n" + (await p.innerText("#viewContainer")) : p.innerText(s);
const getCount = re => srv.log.filter(l => l.method === "GET" && re.test(l.path)).length;
const clickUpdate = async p => { await p.evaluate(() => { const t = document.querySelector("#appToast"); if (t) { t.classList.remove("show"); t.textContent = ""; } }); await p.click("#refreshBtn"); };

console.log("S0  بارگذاری اول (بدون Cache)"); setData(V1);
let page = await mk(); srv.resetLog(); await page.goto(srv.url + "/index.html"); await loaded(page);
ok(getCount(/^\/data\/1520\.xlsx/) === 1, "Excel دقیقاً یک بار دانلود شد");
ok(workers >= 1, "پردازش در Web Worker انجام شد");
let rec = await idb(page); ok(rec?.length === 1 && rec[0].hash === sha(V1), "رکورد در IndexedDB با hash درست ذخیره شد (" + rec?.[0]?.records + " رکورد)");
ok((await txt(page, "#yearDays")).includes("۱۹۵"), "روز سپری‌شده از سال = ۱۹۵ (۱۴۰۵/۰۷/۰۹)");
const homeV1 = await txt(page, "#mapContainer");

console.log("S1  Dataset بدون تغییر — باز کردن مجدد"); await page.close(); page = await mk(); srv.resetLog(); workers = 0;
await page.goto(srv.url + "/index.html"); await loaded(page); await page.waitForTimeout(700);
ok(getCount(/^\/data\/1520\.xlsx/) === 0, "Excel دانلود نشد");
ok(srv.count(/xlsx\.full\.min\.js/) === 0 && workers === 0, "XLSX بارگذاری نشد و Worker ساخته نشد (Cache مستقیم)");
ok(srv.count(/manifest\.json/) === 1, "فقط manifest.json بررسی شد");
ok(await txt(page, "#mapContainer") === homeV1, "خروجی با اولین بار یکسان است");
console.log("S1b کلیک «به‌روزرسانی» وقتی تغییری نیست"); srv.resetLog(); await clickUpdate(page); await toast(page, "به‌روز است");
ok(getCount(/^\/data\/1520\.xlsx/) === 0, "Excel دوباره دانلود نشد (HEAD=" + srv.log.filter(l => l.method === "HEAD").length + ")");

console.log("S2  Dataset تغییر کرده");
await page.click(".ribbon-item[data-view=finance]"); await page.waitForTimeout(1200); const finV1 = await page.innerText("#viewContainer");
setData(V2); workers = 0; srv.resetLog(); await clickUpdate(page); await toast(page, "داده جدید");
ok(getCount(/^\/data\/1520\.xlsx/) >= 1 && workers >= 1, "دانلود جدید + پردازش در Worker");
ok((await txt(page, "#yearDays")).includes("۲۰۲") && (await txt(page, "#periodTo")).includes("1405/07/16"), "Header: تاریخ پایان و روز سپری‌شده از سال → ۲۰۲");
await page.waitForTimeout(1200); ok(finV1 !== await page.innerText("#viewContainer"), "تب مالی (دارای Memoize) داده قدیمی نشان نمی‌دهد");
await page.click(".ribbon-item[data-view=home]"); await page.waitForTimeout(600);
const homeV2 = await txt(page, "#mapContainer"); ok(homeV2 !== homeV1, "ارقام داشبورد عوض شد");
rec = await idb(page); ok(rec[0].hash === sha(V2) && rec.length === 1, "IndexedDB فقط نسخهٔ جدید را نگه می‌دارد");

console.log("S3  Dataset خراب/ناقص → رد، Cache سالم بماند");
for (const [name, body, expect] of [["فایل خراب", V3, "خراب"], ["ستون ضروری حذف‌شده", V4, "ستون ضروری"], ["تعداد رکورد غیرعادی", V5, "غیرعادی"], ["تاریخ نامعتبر", V6, "تاریخ"]]) {
  setData(body); await clickUpdate(page); await toast(page, "پذیرفته نشد"); const msg = await page.innerText("#appToast"); rec = await idb(page);
  ok(rec[0].hash === sha(V2) && await txt(page, "#mapContainer") === homeV2 && msg.includes(expect), `${name}: رد شد، داده قبلی حفظ شد`); await page.waitForTimeout(300); }
console.log("S3b بازگشت به نسخهٔ سالم"); setData(V1); await clickUpdate(page); await toast(page, "داده جدید");
ok((await txt(page, "#yearDays")).includes("۱۹۵") && (await idb(page))[0].hash === sha(V1), "Dataset سالم بعدی پذیرفته شد");
console.log("S4  Manifest فراموش‌شده"); setData(V2, {manifest: false}); await clickUpdate(page); await toast(page, "داده جدید");
ok((await txt(page, "#yearDays")).includes("۲۰۲"), "فایل عوض شد ولی manifest نه → با اثرانگشت HTTP تشخیص داده شد");
console.log("S4b Manifest قدیمی (فایل عوض شده، manifest نه) — نباید در هر بار باز شدن دانلود مجدد شود");
{ const stale = manifestFor({main: {file: "./1520.xlsx", body: V1, version: "old"}});          // manifest مربوط به نسخهٔ قبلی
  setData(V2, {manifest: false}); srv.overrides.set("/data/manifest.json", {body: stale});
  await page.close(); const c5 = await browser.newContext({serviceWorkers: "block", locale: "fa-IR"}); let p5 = await mk(c5);
  await p5.goto(srv.url + "/index.html"); await loaded(p5);      // اولین ورود (بدون Cache) با Manifest قدیمی
  await toast(p5, "manifest.json قدیمی"); ok(true, "کاربر پیام روشن دریافت می‌کند");
  await p5.close(); p5 = await mk(c5); srv.resetLog(); await p5.goto(srv.url + "/index.html"); await loaded(p5); await p5.waitForTimeout(800);
  ok(getCount(/^\/data\/1520\.xlsx/) === 0, "باز شدن بعدی: Excel دوباره دانلود نشد (قبلاً هر بار دانلود می‌شد)");
  ok((await txt(p5, "#yearDays")).includes("۲۰۲"), "داده درست از Cache نمایش داده می‌شود");
  setData(V3 /* خراب */, {manifest: false}); srv.overrides.set("/data/manifest.json", {body: stale});
  setData(V2, {manifest: true}); srv.resetLog(); await clickUpdate(p5); await toast(p5, "داده"); await p5.waitForTimeout(500);
  ok(getCount(/^\/data\/1520\.xlsx/) === 0, "بعد از اصلاح Manifest: هنوز دانلود اضافه‌ای انجام نمی‌شود (hash یکی است)");
  page = await mk(); await page.goto(srv.url + "/index.html"); await loaded(page); }
console.log("S5  آفلاین"); await ctx.setOffline(true); await clickUpdate(page); await toast(page, "اتصال");
ok(await txt(page, "#mapContainer") === homeV2, "بدون اینترنت: داده ذخیره‌شده نمایش داده می‌شود"); await ctx.setOffline(false);

console.log("S6  Lazy Loading (کاربر تازه)"); setData(V1);
const ctx2 = await browser.newContext({serviceWorkers: "block", viewport: {width: 1100, height: 800}}), p2 = await mk(ctx2);
srv.resetLog(); await p2.goto(srv.url + "/index.html"); await loaded(p2);
ok(srv.count(/dashboards\/(analytics|anomaly|finance|report)\.js|engines\/anomalyEngine\.js/) === 0, "هنگام شروع، داشبوردهای سنگین Load نشدند");
for (const v of ["analytics", "finance", "anomaly", "report"]) { await p2.click(`.ribbon-item[data-view="${v}"]`); await p2.waitForTimeout(900);
  ok(srv.count(new RegExp(`dashboards/${v}\\.js`)) === 1 && (await p2.innerText("#viewContainer")).length > 200, `تب ${v}: هنگام ورود Load و رندر شد`); }
await p2.click(".ribbon-item[data-view=home]"); await p2.waitForTimeout(500); await p2.click("#menuBtn"); await p2.waitForSelector(".st-group");
const groups = await p2.$$eval(".st-group > summary span", e => e.length); ok(groups >= 5, "منوی تنظیمات همهٔ گروه‌ها را دارد (" + groups + ")");
console.log("S7  fallback: مرورگر بدون Worker");
const ctx3 = await browser.newContext({serviceWorkers: "block"}); await ctx3.addInitScript(() => { window.Worker = undefined; }); const p3 = await mk(ctx3); srv.resetLog();
await p3.goto(srv.url + "/index.html"); await loaded(p3); ok(srv.count(/xlsx\.full\.min\.js/) >= 1 && (await p3.innerText("#yearDays")).includes("۱۹۵"), "پردازش روی Main Thread انجام شد");
console.log("S8  خطای کامل بدون Cache"); srv.overrides.set("/data/1520.xlsx", {status: 404, body: "x"});
const p4 = await (await browser.newContext({serviceWorkers: "block"})).newPage(); await p4.goto(srv.url + "/index.html");
await p4.waitForSelector("#viewContainer .empty h3:has-text('انجام نشد')", {timeout: 15000}); ok(true, "پیام خطای واضح نمایش داده می‌شود");
console.log(`\nخطاهای کنسول/صفحه: ${errors.length}`, errors.slice(0, 5)); console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
await browser.close(); srv.close(); process.exit(fail || errors.length ? 1 : 0);
