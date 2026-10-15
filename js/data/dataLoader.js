/* هماهنگ‌کنندهٔ دریافت داده: Manifest → (IndexedDB | دانلود) → Web Worker → Validate → Cache.
   Dataset جدید فقط وقتی جایگزین Cache می‌شود که کاملاً Validate شده باشد؛ وگرنه Cache سالم قبلی دست‌نخورده می‌ماند. */
import {DATASETS, PROCESSORS} from "./dataRegistry.js";
import {getDataset, putDataset} from "./dataCache.js";
import {APP_BASE, MANIFEST_URL, MANIFEST_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS, VENDOR} from "../core/constants.js";
import {loadVendor} from "../core/vendor.js";

const timed = ms => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return {signal: c.signal, done: () => clearTimeout(t)}; };
const err = (code, message, details) => Object.assign(new Error(message), {code, details});

export async function fetchManifest(){
  const t = timed(MANIFEST_TIMEOUT_MS);
  try{ const r = await fetch(MANIFEST_URL, {cache: "no-store", signal: t.signal}); if(!r.ok) return null;
    const m = await r.json(); return m && typeof m === "object" && m.datasets && typeof m.datasets === "object" ? m : null;
  }catch{ return null; }finally{ t.done(); }
}
const fileUrl = def => new URL(def.file, APP_BASE).href;
const fingerprintOf = (h, len) => ({etag: h.get("etag") || "", lastModified: h.get("last-modified") || "", length: Number(h.get("content-length")) || len || 0});
async function headFingerprint(def){
  const t = timed(MANIFEST_TIMEOUT_MS);
  try{ const r = await fetch(fileUrl(def), {method: "HEAD", cache: "no-store", signal: t.signal}); return r.ok ? fingerprintOf(r.headers) : null; }
  catch{ return null; }finally{ t.done(); }
}
const fpChanged = (a, b) => a.etag && b.etag ? a.etag !== b.etag : a.lastModified && b.lastModified ? a.lastModified !== b.lastModified : (a.length && b.length ? a.length !== b.length : false);

async function download(def, entry, reload){
  const tag = entry?.hash?.slice(0, 16) || entry?.version || "";
  const url = fileUrl(def) + (tag ? "?v=" + encodeURIComponent(tag) : "") + (reload ? (tag ? "&" : "?") + "r=" + Date.now() : "");
  const t = timed(DOWNLOAD_TIMEOUT_MS); let r;
  try{ r = await fetch(url, {cache: reload ? "reload" : "no-cache", signal: t.signal}); }
  catch(e){ throw err("NETWORK", e?.name === "AbortError" ? "زمان دریافت فایل به پایان رسید." : "دسترسی به فایل ممکن نیست. اتصال را بررسی کنید (یا صفحه را با سرور محلی/Static Hosting باز کنید، نه file://). مسیر: " + def.file); }
  finally{ t.done(); }
  if(!r.ok) throw err("HTTP", `فایل پیدا نشد (${r.status}): ${def.file}`);
  const buffer = await r.arrayBuffer();
  return {buffer, fingerprint: fingerprintOf(r.headers, buffer.byteLength), size: buffer.byteLength};
}

let seq = 0;
function runInWorker(job){
  return new Promise((resolve, reject) => {
    let w; const id = ++seq;
    try{ w = new Worker(new URL("./dataWorker.js", import.meta.url), {type: "module"}); }
    catch(e){ return reject(err("WORKER_FAILED", "Web Worker در این مرورگر در دسترس نیست.", String(e))); }
    const kill = setTimeout(() => { w.terminate(); reject(err("WORKER_FAILED", "Worker پاسخ نداد.")); }, DOWNLOAD_TIMEOUT_MS + 15000);
    const end = () => { clearTimeout(kill); w.terminate(); };
    w.onmessage = ({data}) => { if(data.id !== id) return;
      if(data.type === "stage") return job.onStage?.(data.stage);
      end(); data.type === "done" ? resolve(data) : reject(err(data.error.code, data.error.message, data.error.details)); };
    w.onerror = ev => { end(); reject(err("WORKER_FAILED", "اجرای Worker شکست خورد.", ev?.message)); };
    w.postMessage({id, buffer: job.buffer, processorId: job.processorId, xlsxUrls: VENDOR.xlsx, ctx: job.ctx});   // بدون transfer تا fallback ممکن بماند
  });
}
async function runOnMain(job){
  let XLSX; try{ XLSX = await loadVendor("xlsx", "XLSX"); }catch(e){ throw err("LIB_FAILED", "بارگذاری کتابخانهٔ خواندن Excel ممکن نشد (vendor/ و CDN).", String(e?.message || e)); }
  const {runPipeline} = await import("./pipeline.js");
  return runPipeline({buffer: job.buffer, XLSX, processorId: job.processorId, ctx: job.ctx, onStage: job.onStage});
}
async function processBuffer(job){
  try{ return {...(await runInWorker(job)), via: "worker"}; }
  catch(e){ if(e.code !== "WORKER_FAILED" && e.code !== "LIB_FAILED") throw e;
    console.warn("[data] Worker شکست خورد؛ پردازش روی Main Thread", e.message, e.details || "");
    return {...(await runOnMain(job)), via: "main"}; }
}

export async function getProcessorVersion(id){ const m = PROCESSORS[DATASETS[id].processor]; return m ? (await import(m)).version : 0; }
/** رکورد Cache فقط اگر با نسخهٔ فعلی پردازشگر سازگار باشد */
export async function getCachedRecord(id){
  const rec = await getDataset(id);
  return rec && rec.processorVersion === await getProcessorVersion(id) && rec.processedData?.rows?.length ? rec : null;
}

/** force=false: باز شدن برنامه — فقط Manifest. force=true: کلید «به‌روزرسانی» — علاوه بر Manifest، اثرانگشت HTTP (HEAD) برای Manifest فراموش‌شده.
 *  خروجی: {status: unchanged|updated|rejected|offline|error, record, problems[], warnings[], via, downloaded} */
export async function syncDataset(id, {force = false, onStage} = {}){
  const def = DATASETS[id], stale = await getDataset(id), procVer = await getProcessorVersion(id);
  const cached = stale && stale.processorVersion === procVer && stale.processedData?.rows?.length ? stale : null;
  const manifest = await fetchManifest(), entry = manifest?.datasets?.[id] || null;
  let need = false, fp = null;
  if(!cached) need = true;
  /* Manifest قدیمی (فایل عوض شده ولی build-manifest اجرا نشده) که قبلاً شناسایی شده: به آن اعتماد نمی‌کنیم و به‌جای دانلود مجدد در هر بار باز شدن،
     فقط اثرانگشت HTTP فایل سنجیده می‌شود. به‌محض اصلاح Manifest (hash تازه)، این حالت خودکار پایان می‌یابد. */
  const manifestKnownStale = !!(cached && entry?.hash && cached.metadata?.staleManifestHash === entry.hash);
  if(cached && entry && (entry.hash || entry.version) && !manifestKnownStale){
    const same = entry.hash && cached.hash ? entry.hash === cached.hash : entry.version === cached.version;
    if(!same) need = true; }
  if(!need && cached && (force || !entry || manifestKnownStale)){
    fp = await headFingerprint(def);
    if(fp && cached.metadata?.fingerprint && fpChanged(fp, cached.metadata.fingerprint)) need = true; }
  if(!need) return {status: manifest || fp ? "unchanged" : "offline", record: cached, problems: [], warnings: [], downloaded: false};

  const ctx = {previousRecords: (cached || stale)?.metadata?.records || 0, allowCountChange: !!entry?.allowCountChange};
  const job = buffer => ({buffer, processorId: def.processor, ctx, onStage}), warnings = []; let staleManifestHash = "";
  try{
    let dl = await download(def, entry, false), res = await processBuffer(job(dl.buffer));
    if(entry?.hash && res.hash && res.hash !== entry.hash){          // نسخهٔ قدیمی در CDN/Cache مرورگر؟ یک بار بدون Cache تلاش مجدد
      dl = await download(def, entry, true); res = await processBuffer(job(dl.buffer));
      if(res.hash !== entry.hash){ staleManifestHash = entry.hash; warnings.push("فایل جدید اعمال شد، ولی manifest.json قدیمی است. دستور  node tools/build-manifest.mjs  را اجرا و manifest را منتشر کنید."); }
    }
    const {fatal, suspect} = res.report;
    if(fatal.length || (suspect.length && cached)) return {status: "rejected", record: cached, problems: [...fatal, ...suspect], warnings, downloaded: true, via: res.via};
    warnings.push(...suspect);
    if(cached && res.hash && res.hash === cached.hash){              // محتوا یکسان؛ فقط اثرانگشت تازه می‌شود
      const rec = {...cached, version: entry?.version || cached.version, metadata: {...cached.metadata, fingerprint: dl.fingerprint, staleManifestHash}};
      await putDataset(rec); return {status: "unchanged", record: rec, problems: [], warnings, downloaded: true, via: res.via}; }
    const rec = {datasetId: id, version: entry?.version || "auto-" + String(res.hash || Date.now()).slice(0, 8), hash: res.hash, processorVersion: res.processorVersion,
      processedData: res.processed,
      metadata: {records: res.processed.rows.length, period: res.processed.period, sheetName: res.sheetName, fileSize: dl.size, fingerprint: dl.fingerprint, stats: res.report.stats, source: def.file, manifestVersion: manifest?.version || "", staleManifestHash}};
    await putDataset(rec);
    return {status: "updated", record: rec, problems: [], warnings, downloaded: true, via: res.via};
  }catch(e){
    return {status: cached ? (e.code === "NETWORK" ? "offline" : "rejected") : "error", record: cached, problems: [e.message || String(e)], warnings, downloaded: false, code: e.code};
  }
}
