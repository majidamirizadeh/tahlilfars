/* بررسی: همهٔ importهای نسبی js/ به فایل موجود اشاره می‌کنند + گزارش وابستگی چرخه‌ای */
import fs from "node:fs"; import path from "node:path";
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e => e.isDirectory()? walk(path.join(d,e.name)) : e.name.endsWith(".js")? [path.join(d,e.name)] : []);
const files = walk("js"), graph = new Map(); let bad = 0;
for (const f of files) { const src = fs.readFileSync(f,"utf8"), deps = [];
  for (const m of src.matchAll(/(?:from\s*|import\s*\(?\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
    const t = path.normalize(path.join(path.dirname(f), m[1]));
    if (!fs.existsSync(t)) { console.log("✗ MISSING", f, "→", m[1]); bad++; }
    else if (!/import\s*\(/.test(src.slice(Math.max(0,m.index-1), m.index+9))) deps.push(t); }
  graph.set(f, deps); }
const cyc = new Set();
for (const f of files) { const stack = [], seen = new Set();
  (function dfs(n){ if(stack.includes(n)){ cyc.add([...stack.slice(stack.indexOf(n)), n].map(x=>path.basename(x)).join(" → ")); return; } if(seen.has(n)) return; seen.add(n); stack.push(n); (graph.get(n)||[]).forEach(dfs); stack.pop(); })(f); }
console.log(bad ? `✗ ${bad} import(s) broken` : `✓ ${files.length} files — all relative imports resolve`);
console.log(cyc.size ? "⚠ cycles:\n  "+[...cyc].join("\n  ") : "✓ no circular dependencies");
process.exit(bad?1:0);
