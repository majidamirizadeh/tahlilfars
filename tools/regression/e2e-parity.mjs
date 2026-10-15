/* مقایسهٔ متن DOM نسخهٔ قدیمی و جدید روی همان داده: node e2e-parity.mjs <oldRoot> <newRoot> */
import fs from "node:fs"; import {createRequire} from "node:module"; const {chromium} = createRequire(import.meta.url)("playwright");
import {startServer, XLSX_SHIM, LUCIDE_SHIM} from "./e2e-lib.mjs";
const [oldRoot, newRoot] = process.argv.slice(2), raw = fs.readFileSync(new URL("./raw-1520.json", import.meta.url));
const VIEWS = ["home:stats","home:percapita","home:indices","analytics","anomaly","finance","report"];
async function capture(root) {
  const srv = await startServer(root); srv.overrides.set("/data/1520.xlsx", {body: raw});
  const browser = await chromium.launch(), ctx = await browser.newContext({serviceWorkers: "block", viewport: {width: 1280, height: 900}, locale: "fa-IR"});
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/xlsx/, r => r.fulfill({contentType: "text/javascript", body: XLSX_SHIM}));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/lucide/, r => r.fulfill({contentType: "text/javascript", body: LUCIDE_SHIM}));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/chart/, r => r.fulfill({contentType: "text/javascript", body: ""}));
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message)); page.on("console", m => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && errors.push("console: " + m.text()));
  await page.goto(srv.url + "/index.html");
  await page.waitForFunction(() => document.querySelector("#yearDays")?.textContent.trim() !== "—" && document.querySelector("#mapContainer .map-dashboard"), null, {timeout: 20000}); await page.waitForTimeout(600);
  const out = {header: await page.innerText(".topbar")};
  for (const v of VIEWS) { const [view, mode] = v.split(":");
    await page.click(`.ribbon-item[data-view="${view}"]`); await page.waitForTimeout(900);
    if (mode) { await page.click(`#mapModeTabs .map-mode-tab[data-mode="${mode}"]`); await page.waitForTimeout(500); }
    out[v] = (await page.innerText("#mapContainer").catch(() => "")) + "\n#####\n" + (await page.innerText("#viewContainer").catch(() => "")); }
  await page.click(".ribbon-item[data-view=home]"); await page.waitForTimeout(400);
  await page.click("#menuBtn"); await page.waitForSelector(".st-group"); await page.waitForTimeout(300);
  out.settings = await page.innerText("#settingsRoot");
  await browser.close(); srv.close(); return {out, errors};
}
const a = await capture(oldRoot), b = await capture(newRoot); let bad = 0;
for (const k of Object.keys(a.out)) { const same = a.out[k] === b.out[k]; console.log(same ? "✓" : "✗", k.padEnd(16), `${a.out[k].length} chars`);
  if (!same) { bad++; const x = a.out[k], y = b.out[k]; let i = 0; while (i < x.length && x[i] === y[i]) i++; console.log("  old:", JSON.stringify(x.slice(i-30,i+60)), "\n  new:", JSON.stringify(y.slice(i-30,i+60))); } }
console.log("errors old:", a.errors.length, "| errors new:", b.errors.length, b.errors.slice(0, 5));
process.exit(bad || b.errors.length ? 1 : 0);
