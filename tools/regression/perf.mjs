/* زمان رسیدن به اولین نمای کامل + حجم JS برنامه (موبایل ۳۹۰px، CPU ۴× کندتر، median از ۵ اجرا). node perf.mjs <oldRoot> <newRoot>
   توجه: XLSX/Lucide شیم‌اند؛ هزینهٔ دانلود/پارس واقعی کتابخانه‌ها (بزرگ‌ترین بخش در عمل) اینجا لحاظ نشده است. */
import fs from "node:fs"; import {createRequire} from "node:module"; const {chromium} = createRequire(import.meta.url)("playwright");
import {startServer, XLSX_SHIM, LUCIDE_SHIM, manifestFor} from "./e2e-lib.mjs";
const [oldRoot, newRoot] = process.argv.slice(2), raw = fs.readFileSync(new URL("./raw-1520.json", import.meta.url));
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const route = c => c.route(/cdn\.jsdelivr\.net/, r => r.fulfill({contentType: "text/javascript", body: /xlsx/.test(r.request().url()) ? XLSX_SHIM : /lucide/.test(r.request().url()) ? LUCIDE_SHIM : ""}));
async function run(root, warm) {
  const srv = await startServer(root); srv.overrides.set("/data/1520.xlsx", {body: raw}); srv.overrides.set("/data/manifest.json", {body: manifestFor({main: {file: "./1520.xlsx", body: raw, version: "t"}})});
  const b = await chromium.launch(), times = []; let jsBytes = 0, jsReq = 0; const shared = await b.newContext({serviceWorkers: "block", viewport: {width: 390, height: 800}, isMobile: true}); await route(shared);
  for (let i = 0; i < (warm ? 6 : 5); i++) {
    const c = warm ? shared : await b.newContext({serviceWorkers: "block", viewport: {width: 390, height: 800}, isMobile: true}); if (!warm) await route(c);
    const p = await c.newPage(), cdp = await c.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", {rate: 4});
    const ready = () => p.waitForFunction(() => document.querySelector("#yearDays")?.textContent.trim() !== "—" && document.querySelector("#mapContainer .map-dashboard"), null, {timeout: 60000});
    if (warm && i === 0) { await p.goto(srv.url + "/index.html"); await ready(); await p.close(); continue; }
    srv.resetLog(); const t = Date.now(); await p.goto(srv.url + "/index.html"); await ready(); times.push(Date.now() - t);
    const js = srv.log.filter(l => /^\/js\/.*\.js$/.test(l.path)); jsReq = js.length; jsBytes = js.reduce((a, l) => a + fs.statSync(root + l.path).size, 0);
    await p.close(); if (!warm) await c.close();
  }
  await b.close(); srv.close(); return {ms: med(times), appJS_KB: Math.round(jsBytes / 1024), jsRequests: jsReq};
}
console.log("قدیمی (هر بار Excel)     ", await run(oldRoot, false));
console.log("جدید — اولین ورود        ", await run(newRoot, false));
console.log("جدید — ورودهای بعدی(Cache)", await run(newRoot, true));
