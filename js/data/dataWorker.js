/* Web Worker (module) — Read/Parse/Normalize/Validate بیرون از Main Thread؛ XLSX فقط داخل همین Worker بارگذاری می‌شود. */
import {runPipeline, serializeError, PipelineError} from "./pipeline.js";
let xlsxPromise = null;
function ensureXLSX(urls){
  if(globalThis.XLSX?.read) return Promise.resolve(globalThis.XLSX);
  return xlsxPromise ??= (async () => { let last;
    for(const u of urls){ try{ const r = await fetch(u); if(!r.ok) throw new Error("HTTP " + r.status);
      (0, eval)(await r.text()); if(globalThis.XLSX?.read) return globalThis.XLSX; throw new Error("XLSX global missing"); }catch(e){ last = e; } }
    xlsxPromise = null; throw new PipelineError("LIB_FAILED", "بارگذاری کتابخانهٔ خواندن Excel ممکن نشد (vendor/ و CDN).", String(last?.message || last)); })();
}
self.onmessage = async ({data}) => {
  const {id, buffer, processorId, xlsxUrls, ctx} = data, stage = s => self.postMessage({id, type: "stage", stage: s});
  try{ stage("lib"); const XLSX = await ensureXLSX(xlsxUrls);
    self.postMessage({id, type: "done", ...(await runPipeline({buffer, XLSX, processorId, ctx, onStage: stage}))});
  }catch(e){ self.postMessage({id, type: "error", error: serializeError(e)}); }
};
