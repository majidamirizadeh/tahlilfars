/* پردازشگر دیتاست «گزارش 1520»: Read → Normalize (processRaw بدون تغییر منطقی) → Validate. بدون Business Logic. */
import {processRaw, ALIASES} from "../dataProcessor.js";
export const version = 1;   /* با تغییر منطق خوانش/نرمال‌سازی این عدد را بالا ببرید تا Cache قدیمی باطل شود */
const REQUIRED = ["area","city","usage","customers","consumption","income","collection","debtStart","debtEnd"];
const NUMERIC  = ["customers","consumption","income","collection","debtStart","debtEnd"];
export const process = raw => processRaw(raw);

/** {fatal, suspect, stats} — fatal: همیشه Reject · suspect: اگر Dataset سالم قبلی هست Reject، وگرنه فقط هشدار */
export function validate(processed, raw, ctx = {}){
  const fatal = [], suspect = [], {rows, idx, period, headerRow} = processed;
  const missing = REQUIRED.filter(k => !(idx[k] >= 0));
  if(missing.length) fatal.push(`ستون ضروری پیدا نشد: ${missing.map(k => ALIASES[k][0]).join("، ")}`);
  if(!rows.length) fatal.push("هیچ رکوردی در فایل پیدا نشد.");
  else if(rows.length < 10) suspect.push(`تعداد رکوردها بسیار کم است (${rows.length}).`);
  if(!missing.length && rows.length){
    let cells = 0, bad = 0; const samples = [];
    for(const r of raw.slice(headerRow + 1)){
      if(!r || !r.some(c => c !== null && c !== "")) continue;
      if(String(r[idx.city] ?? "").replace(/‌/g," ").trim().startsWith("جمع")) continue;
      for(const k of NUMERIC){ const v = r[idx[k]]; cells++;
        if(v === null || v === undefined || v === "" || typeof v === "number" && Number.isFinite(v)) continue;
        if(typeof v === "string" && /^\s*-?[\d,]+(\.\d+)?\s*$/.test(v)) continue;
        bad++; if(samples.length < 3) samples.push(String(v).slice(0, 20)); }
    }
    if(bad && bad / Math.max(1, cells) > 0.01) suspect.push(`${bad} سلول عددی نامعتبر (نمونه: ${samples.join("، ")}).`);
    if(!rows.some(r => r.customers > 0)) suspect.push("مجموع تعداد مشترک صفر است.");
  }
  if(!period.from || !period.to || period.yearDay == null || !Number.isFinite(period.days) || period.days <= 0)
    suspect.push("بازهٔ تاریخ گزارش (از/تا) در عنوان فایل پیدا یا معتبر نیست.");
  const prev = ctx.previousRecords;
  if(prev > 0 && !ctx.allowCountChange){ const ratio = rows.length / prev;
    if(ratio < 0.5 || ratio > 2) suspect.push(`تعداد رکوردها نسبت به نسخهٔ قبل غیرعادی است (${prev} ← ${rows.length}). اگر عمدی است در manifest مقدار allowCountChange=true بگذارید.`); }
  return {fatal, suspect, stats: {records: rows.length, areas: new Set(rows.map(r => r.area)).size, cities: new Set(rows.map(r => r.city)).size, usages: new Set(rows.map(r => r.usage)).size}};
}
