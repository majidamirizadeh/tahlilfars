#!/usr/bin/env node
/* دانلود کتابخانه‌ها به vendor/ (نیازمند اینترنت؛ در Deploy خودکار اجرا می‌شود). برنامه بدون vendor/ هم کار می‌کند (fallback به CDN). */
import fs from "node:fs"; import path from "node:path"; import {fileURLToPath} from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIBS = {"vendor/xlsx/xlsx.full.min.js": "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "vendor/lucide/lucide.min.js": "https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js"};
let fail = 0;
for (const [rel, url] of Object.entries(LIBS)) { try { const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 10000) throw new Error("فایل مشکوک/کوچک");
  fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); fs.writeFileSync(path.join(root, rel), buf); console.log(`✓ ${rel} (${(buf.length/1024).toFixed(0)} KB)`);
} catch (e) { console.error(`✗ ${rel}: ${e.message}`); fail++; } }
process.exit(fail ? 1 : 0);
