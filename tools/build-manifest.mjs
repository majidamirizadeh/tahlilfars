#!/usr/bin/env node
/* ساخت/به‌روزرسانی data/manifest.json از فایل‌های ثبت‌شده در js/data/dataRegistry.js
   node tools/build-manifest.mjs [--check] — فقط وقتی hash عوض شود version بالا می‌رود (YYYY-MM-DD-NN). بدون وابستگی خارجی. */
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import {fileURLToPath, pathToFileURL} from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {DATASETS} = await import(pathToFileURL(path.join(root, "js/data/dataRegistry.js")).href);
const mp = path.join(root, "data/manifest.json");
const prev = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, "utf8")) : {datasets: {}};
const today = new Date().toISOString().slice(0, 10), out = {version: prev.version || today, datasets: {}};
let changed = !fs.existsSync(mp);
for (const d of Object.values(DATASETS)) {
  const abs = path.join(root, d.file);
  if (!fs.existsSync(abs)) { console.warn(`⚠ ${d.id}: فایل ${d.file} وجود ندارد؛ از manifest حذف شد`); changed = true; continue; }
  const buf = fs.readFileSync(abs), hash = crypto.createHash("sha256").update(buf).digest("hex"), old = prev.datasets?.[d.id];
  let version = old?.version;
  if (!old || old.hash !== hash) { const n = old?.version?.startsWith(today) ? Number(old.version.split("-")[3] || 0) + 1 : 1;
    version = `${today}-${String(n).padStart(2, "0")}`; changed = true; console.log(`↻ ${d.id}: ${old?.hash ? "تغییر کرد" : "جدید"} → ${version}`); }
  out.datasets[d.id] = {file: "./" + path.relative(path.join(root, "data"), abs).split(path.sep).join("/"), version, hash, size: buf.length, ...(old?.allowCountChange ? {allowCountChange: true} : {})};
}
if (changed) out.version = today;
const text = JSON.stringify(out, null, 2) + "\n";
if (process.argv.includes("--check")) { if (changed) { console.error("✗ manifest.json به‌روز نیست"); process.exit(1); } console.log("✓ manifest.json به‌روز است"); process.exit(0); }
if (changed || fs.readFileSync(mp, "utf8") !== text) { fs.writeFileSync(mp, text); console.log("✓ data/manifest.json نوشته شد"); } else console.log("✓ بدون تغییر");
