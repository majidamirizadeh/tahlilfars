/* Regression snapshot — روی هر دو ساختار (قدیمی js/modules و جدید js/engines) اجرا می‌شود.
   node tools/regression/snapshot.mjs <rootDir> <out.json> [raw.json] */
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import {pathToFileURL} from "node:url";
const [root, out, rawPath = new URL("./raw-1520.json", import.meta.url).pathname] = process.argv.slice(2);
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = {getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k)};
const pick = (...c) => { const f = c.find(p => fs.existsSync(path.join(root, p))); if(!f) throw new Error("missing: "+c.join(" | ")); return pathToFileURL(path.join(root, f)).href; };
const imp = (...c) => import(pick(...c));
const {processRaw} = await imp("js/data/dataProcessor.js", "js/dataProcessor.js");
const {calc} = await imp("js/engines/metrics.js", "js/dashboards/map.js");
const A = await imp("js/engines/analyticsEngine.js", "js/modules/analyticsEngine.js");
const F = await imp("js/engines/financeEngine.js", "js/modules/financeEngine.js");
const N = await imp("js/engines/anomalyEngine.js", "js/modules/anomalyEngine.js");
const Z = await imp("js/engines/zeroWatchEngine.js", "js/modules/zeroWatchEngine.js");
const S = await imp("js/filters/scopeFilters.js", "js/modules/scopeFilters.js");
const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
const p = processRaw(raw);
window.__REPORT_MONTHS = p.period.months || 1; window.__REPORT_DAYS = p.period.days || 0;
const ser = v => JSON.stringify(v, (k, x) => k === "generatedAt" ? undefined : x instanceof Map ? {__map:[...x.entries()]} : x instanceof Set ? {__set:[...x]} :
  typeof x === "number" && !Number.isFinite(x) ? String(x) : typeof x === "function" ? undefined : x);
const h = v => crypto.createHash("sha256").update(ser(v) ?? "undefined").digest("hex").slice(0, 16);
const safe = fn => { try { return fn(); } catch (e) { return {__error: String(e.message || e)}; } };
const uniq = (rows, k) => [...new Set(rows.map(r => r[k]).filter(Boolean))];
const METRICS = ["customers","consumption","income","collection","debtEnd","debtStart","perConsumption","perIncome","perCollection","perDebt","perConsumptionDay","perIncomeDay","perCollectionDay","idxCollection","idxPrice","idxCycle","debtGrowth","debtRisk"];
const metricsOf = rows => Object.fromEntries(METRICS.map(m => [m, calc(rows, m)]));
const counts = {records: p.rows.length, areas: uniq(p.rows,"area").length, cities: uniq(p.rows,"city").length, usages: uniq(p.rows,"usage").length, rowsHash: h(p.rows), period: p.period};
const SCOPES = {
  all: p.rows,
  noArmed: S.scopeRows(p.rows, {armed:"without", settlement:"all"}),
  armedOnly: S.scopeRows(p.rows, {armed:"only", settlement:"all"}),
  city_noArmed: S.scopeRows(p.rows, {armed:"without", settlement:"city"}),
  rural_noArmed: S.scopeRows(p.rows, {armed:"without", settlement:"rural"})
};
const digest = {counts, scopes: {}};
for (const [name, rows] of Object.entries(SCOPES)) {
  const o = {byArea:{}, byUsage:{}, byCity:{}};
  for (const a of uniq(rows,"area")) o.byArea[a] = metricsOf(rows.filter(r => r.area === a));
  for (const u of uniq(rows,"usage")) o.byUsage[u] = metricsOf(rows.filter(r => r.usage === u));
  for (const c of uniq(rows,"city")) o.byCity[c] = metricsOf(rows.filter(r => r.city === c));
  o.score = {province: safe(() => A.healthScore(rows)), byArea: Object.fromEntries(uniq(rows,"area").map(a => [a, safe(() => A.healthScore(rows.filter(r => r.area === a)))]))};
  o.structural = {}; o.alerts = {};
  for (const level of ["province","area","city"]) for (const metric of ["idxCollection","idxCycle","debtGrowth","debtRisk","idxPrice"]) {
    o.structural[level+":"+metric] = safe(() => A.structuralAnalysis(rows, {level, metric}));
    o.alerts[level+":"+metric] = safe(() => A.generalAlerts(rows, {level, metric}));
  }
  o.importantUsages = safe(() => A.importantUsages(rows));
  const fin = safe(() => F.analyzeFinance(rows, {days: window.__REPORT_DAYS, tag: name}));
  o.finance = fin; o.zeroWatch = safe(() => Z.analyzeZeroWatch(fin)); o.financeView = safe(() => F.buildFinView(fin, {}));
  o.anomaly = {};
  for (const lv of N.LEVELS) o.anomaly[lv.id] = safe(() => N.analyzeAnomalies(rows, {filters:{level:lv.id, areas:[], cities:[], usages:[]}}));
  digest.scopes[name] = {n: rows.length, province: metricsOf(rows),
    sections: Object.fromEntries(Object.keys(o).map(k => [k, h(o[k])])),
    errors: JSON.stringify(o).match(/"__error":"[^"]*"/g) || []};
}
fs.writeFileSync(out, JSON.stringify(digest, null, 1));
console.log("snapshot ok →", out, "| records", counts.records, "| areas", counts.areas, "| cities", counts.cities, "| usages", counts.usages);
