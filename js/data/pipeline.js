/* خط لوله: hash → Read → Parse → Normalize → Validate. هم در Worker و هم (fallback) روی Main Thread؛ بدون DOM و بدون Business Logic. */
import {PROCESSORS} from "./dataRegistry.js";
export class PipelineError extends Error { constructor(code, message, details){ super(message); this.code = code; this.details = details; } }
export const serializeError = e => ({code: e.code || "UNKNOWN", message: e.message || String(e), details: e.details});
export async function sha256Hex(buffer){
  try{ if(!globalThis.crypto?.subtle) return null; const d = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }catch{ return null; }
}
export async function runPipeline({buffer, XLSX, processorId, ctx = {}, onStage = () => {}}){
  if(!buffer || buffer.byteLength < 100) throw new PipelineError("EMPTY_FILE", "محتوای فایل Excel خالی یا ناقص است.");
  const modPath = PROCESSORS[processorId];
  if(!modPath) throw new PipelineError("NO_PROCESSOR", `پردازشگر «${processorId}» در رجیستری ثبت نشده است.`);
  const proc = await import(modPath);
  onStage("hash"); const hash = await sha256Hex(buffer);
  onStage("read"); let wb;
  try{ wb = XLSX.read(buffer, {type: "array", cellDates: true}); }
  catch(e){ throw new PipelineError("READ_FAILED", "فایل Excel قابل خواندن نیست یا خراب است.", String(e?.message || e)); }
  const sheetName = wb.SheetNames?.[0], sheet = sheetName && wb.Sheets[sheetName];
  if(!sheet) throw new PipelineError("NO_SHEET", "هیچ شیتی در فایل Excel پیدا نشد.");
  onStage("parse"); const raw = XLSX.utils.sheet_to_json(sheet, {header: 1, defval: null, raw: true});
  onStage("normalize"); let processed;
  try{ processed = proc.process(raw); }catch(e){ throw new PipelineError("SCHEMA", e?.message || "ساختار فایل با قالب مورد انتظار نمی‌خواند."); }
  onStage("validate"); const report = proc.validate(processed, raw, ctx);
  return {hash, processed, report, sheetName, processorVersion: proc.version};
}
