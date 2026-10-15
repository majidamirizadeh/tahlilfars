#!/usr/bin/env node
/* ساخت لیست Precache و شمارهٔ BUILD داخل sw.js (بین علامت‌های __PRECACHE__). node tools/build-pwa.mjs
   Excel و manifest.json داده (data/) عمداً در لیست نیستند. BUILD = hash محتوای همهٔ فایل‌های پوسته؛ پس هر تغییر → sw.js تغییر می‌کند → به‌روزرسانی خودکار SW. */
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import {fileURLToPath} from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = /^(data|tools|\.github|node_modules|\.git)(\/|$)|^(sw\.js|README\.md|\.nojekyll)$/;
const walk = (d, rel = "") => fs.readdirSync(path.join(root, d), {withFileTypes: true}).flatMap(e => {
  const r = path.posix.join(rel, e.name); if (SKIP.test(r)) return [];
  return e.isDirectory() ? walk(path.join(d, e.name), r) : [r]; });
const files = walk("").sort(), h = crypto.createHash("sha256");
for (const f of files) { h.update(f); h.update(fs.readFileSync(path.join(root, f))); }
const build = h.digest("hex").slice(0, 10);
const list = ["./", ...files.map(f => "./" + f)];
let sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
sw = sw.replace(/const BUILD = ".*?";/, `const BUILD = "${build}";`).replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = [/*__PRECACHE__*/${list.map(u => JSON.stringify(u)).join(",")}];`);
if (process.argv.includes("--check")) { if (sw !== fs.readFileSync(path.join(root, "sw.js"), "utf8")) { console.error("✗ sw.js به‌روز نیست (node tools/build-pwa.mjs)"); process.exit(1); } console.log("✓ sw.js به‌روز است"); process.exit(0); }
fs.writeFileSync(path.join(root, "sw.js"), sw); console.log(`✓ sw.js: BUILD=${build} · ${list.length} فایل در Precache`);
