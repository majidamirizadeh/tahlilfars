/* موتور «تحلیل ناهنجاری، تمرکز و الگوی مصرف»
   ابزار آماری/تحلیلی و Benchmarking است؛ هیچ خروجی‌ای «تخلف»، «هدررفت قطعی» یا «اشتباه قطعی» اعلام نمی‌کند.

   سه تحلیل مستقل و هم‌زمان برای هر رکورد (استان + امور + شهر + کاربری):
     provinceAnalysis  ← Province Benchmark      : شهر × کاربری در برابر همهٔ شهرهای استان در همان کاربری
     affairsAnalysis   ← Affairs Benchmark       : شهر × کاربری در برابر شهرهای همان امور در همان کاربری
     cityAnalysis      ← City Internal Benchmark : کاربری‌های همان شهر با یکدیگر
   هیچ‌کدام جایگزین دیگری نمی‌شود و فیلترهای نمایش، آمار را تغییر نمی‌دهند (فقط View می‌سازند).
   همهٔ آستانه‌ها از رجیستری تنظیمات (settings.js) خوانده می‌شوند. */
import {registerGroup, registerSetting, get as S, reset as resetSetting} from "../settings/settings.js";

export const PROVINCE_NAME = "فارس";
export const ARMED_USAGE = "نیروهای مسلح";
export const ANALYSIS_CONFIG_VERSION = 2;
const VERSION_KEY = "anomaly.analysisConfigVersion";

registerGroup({id:"anomaly", label:"تحلیل مصرف و ناهنجاری", order:7});
const sec = (title, note) => ({section:title, sectionNote:note});

/* ───────── تعریف انواع هشدار (قابل فعال/غیرفعال از تنظیمات) ───────── */
export const ALERT_TYPES = [
  {id:"veryHighPer",   label:"مصرف سرانه بسیار بالا",   dir:"high", sev:3},
  {id:"veryLowPer",    label:"مصرف سرانه بسیار پایین",  dir:"low",  sev:3},
  {id:"zero",          label:"صفرمصرف",                 dir:"low",  sev:2},
  {id:"highZeroRate",  label:"درصد بالای صفرمصرف",      dir:"low",  sev:2},
  {id:"ciVeryHigh",    label:"تمرکز بسیار شدید مصرف",   dir:"high", sev:3},
  {id:"ciVeryLow",     label:"تمرکز بسیار پایین",       dir:"low",  sev:2, offByDefault:true},
  {id:"highVolume",    label:"حجم مصرف بسیار بالا",     dir:"high", sev:2},
  {id:"manyCustLowUse",label:"مشترک زیاد با مصرف کم",   dir:"low",  sev:2}
];
export const ALERT_BY_ID = Object.fromEntries(ALERT_TYPES.map(a=>[a.id,a]));

/* ───────── تنظیمات ───────── */
registerSetting({id:"anomaly.pctVeryHigh", group:"anomaly", ...sec("آستانه صدک سرانه","مقادیر پیش‌فرض صرفاً پیشنهادی‌اند و «استاندارد قانونی» نیستند."),
  label:"صدک بسیار بالا (≥)", default:95, min:50, max:100, step:1, unit:"٪"});
registerSetting({id:"anomaly.pctVeryLow", group:"anomaly", section:"آستانه صدک سرانه",
  label:"صدک بسیار پایین (≤)", default:5, min:0, max:50, step:1, unit:"٪"});

registerSetting({id:"anomaly.ciVeryHigh", group:"anomaly", ...sec("آستانه ضریب تمرکز (Concentration Index)",
  "ضریب تمرکز = سهم مصرف ÷ سهم مشترک در همان جامعه مرجع. ۱ = متناسب. ضریب تمرکز به‌تنهایی اثبات مشکل نیست."),
  label:"ضریب تمرکز بسیار بالا (≥)", default:3, min:1, max:20, step:0.1});
registerSetting({id:"anomaly.ciVeryLow", group:"anomaly", section:"آستانه ضریب تمرکز (Concentration Index)",
  label:"ضریب تمرکز بسیار پایین (≤)", default:0.4, min:0, max:1, step:0.05});

registerSetting({id:"anomaly.minCustomers", group:"anomaly", ...sec("حداقل‌ها",
  "رکوردهای کوچک‌تر از این آستانه‌ها در هشدارهای سرانه/تمرکز لحاظ نمی‌شوند (در جدول و کیفیت داده می‌مانند)."),
  label:"حداقل تعداد مشترک", default:5, min:0, max:10000, step:1});
registerSetting({id:"anomaly.minConsumption", group:"anomaly", section:"حداقل‌ها",
  label:"حداقل مصرف (م³)", default:100, min:0, max:1e9, step:10, unit:"m³"});
registerSetting({id:"anomaly.minPopulation", group:"anomaly", section:"حداقل‌ها",
  label:"حداقل اندازه جامعه آماری برای صدک/رتبه/CI", default:2, min:2, max:100, step:1});
registerSetting({id:"anomaly.zeroThreshold", group:"anomaly", section:"حداقل‌ها",
  label:"آستانه صفرمصرف (م³) — پیش‌فرض دقیقاً صفر", default:0, min:0, max:1000, step:1, unit:"m³"});
registerSetting({id:"anomaly.zeroMinCustomers", group:"anomaly", section:"حداقل‌ها",
  label:"حداقل مشترک برای هشدار صفرمصرف", default:1, min:1, max:10000, step:1});
registerSetting({id:"anomaly.zeroRateHigh", group:"anomaly", section:"حداقل‌ها",
  label:"درصد بالای صفرمصرف در جامعه مرجع (≥)", default:10, min:0, max:100, step:1, unit:"٪"});

registerSetting({id:"anomaly.shareVolumeHigh", group:"anomaly", ...sec("حجم و اهمیت حجمی",""),
  label:"سقف سهم مصرف برای نرمال‌سازی اهمیت حجمی", default:0.2, min:0.01, max:1, step:0.01});
registerSetting({id:"anomaly.matHigh", group:"anomaly", section:"حجم و اهمیت حجمی",
  label:"اهمیت حجمی بالا (≥)", default:70, min:0, max:100, step:1});
registerSetting({id:"anomaly.matVeryHigh", group:"anomaly", section:"حجم و اهمیت حجمی",
  label:"حجم مصرف بسیار بالا (اهمیت حجمی ≥)", default:85, min:0, max:100, step:1});
registerSetting({id:"anomaly.volumeMinPopulation", group:"anomaly", section:"حجم و اهمیت حجمی",
  label:"حداقل اندازه جامعه برای هشدار «حجم بسیار بالا» (فقط در سطح استان)", default:5, min:2, max:200, step:1});
registerSetting({id:"anomaly.manyCustomers", group:"anomaly", section:"حجم و اهمیت حجمی",
  label:"«مشترک زیاد» یعنی حداقل تعداد مشترک", default:50, min:1, max:1e6, step:1});

registerSetting({id:"anomaly.wAnomaly", group:"anomaly", ...sec("امتیاز اولویت ترکیبی",
  "وزن‌ها پیش‌فرض قابل تغییرند و استاندارد قانونی/مدیریتی نیستند. اولویت = میانگین وزنی امتیاز ناهنجاری و اهمیت حجمی (۰ تا ۱۰۰)."),
  label:"وزن امتیاز ناهنجاری", default:60, min:0, max:100, step:5, unit:"٪"});
registerSetting({id:"anomaly.wMaterial", group:"anomaly", section:"امتیاز اولویت ترکیبی",
  label:"وزن اهمیت حجمی", default:40, min:0, max:100, step:5, unit:"٪"});
registerSetting({id:"anomaly.band1", group:"anomaly", section:"امتیاز اولویت ترکیبی",
  label:"مرز «متوسط» در تفسیر امتیاز (≥)", default:25, min:1, max:99, step:1});
registerSetting({id:"anomaly.band2", group:"anomaly", section:"امتیاز اولویت ترکیبی",
  label:"مرز «بالا» در تفسیر امتیاز (≥)", default:50, min:1, max:99, step:1});
registerSetting({id:"anomaly.band3", group:"anomaly", section:"امتیاز اولویت ترکیبی",
  label:"مرز «بسیار بالا» در تفسیر امتیاز (≥)", default:75, min:1, max:99, step:1});

registerSetting({id:"anomaly.topN", group:"anomaly", ...sec("خروجی و رتبه‌بندی",""),
  label:"تعداد برترین‌ها", default:20, min:1, max:500, step:1});
registerSetting({id:"anomaly.sortMode", group:"anomaly", section:"خروجی و رتبه‌بندی",
  label:"روش رتبه‌بندی پیش‌فرض (۱ سرانه · ۲ ضریب تمرکز · ۳ شدت ناهنجاری · ۴ اهمیت حجمی · ۵ ترکیبی · ۶ مصرف کل)", default:5, min:1, max:6, step:1});
registerSetting({id:"anomaly.method", group:"anomaly", section:"خروجی و رتبه‌بندی",
  label:"روش محاسبه ناهنجاری (۱ صدک · ۲ فاصله از میانه (MAD) · ۳ صدک + ضریب تمرکز · ۴ همه)", default:4, min:1, max:4, step:1});

registerSetting({id:"anomaly.includeArmed", group:"anomaly", ...sec("دامنهٔ کاربری‌ها",
  "این تنظیم فقط دامنهٔ محاسبات را تغییر می‌دهد؛ دادهٔ اصلی Excel هرگز حذف نمی‌شود."),
  label:"احتساب نیروهای مسلح در تحلیل", type:"bool", default:true});
registerSetting({id:"anomaly.disabledUsages", group:"anomaly", section:"دامنهٔ کاربری‌ها",
  label:"کاربری‌های غیرفعال (انتخاب‌شده‌ها از تحلیل کنار گذاشته می‌شوند)", type:"list", default:[]});

for(const a of ALERT_TYPES){
  registerSetting({id:`anomaly.alert.${a.id}`, group:"anomaly",
    ...(a===ALERT_TYPES[0] ? sec("فعال/غیرفعال کردن انواع هشدار","") : {section:"فعال/غیرفعال کردن انواع هشدار"}),
    label:a.label + (a.offByDefault ? " (پیش‌فرض خاموش)" : ""), type:"bool", default:!a.offByDefault});
}

/* نسخهٔ ساختار تنظیمات: در صورت ناسازگاری نسخه، فقط کلیدهای همین ماژول به پیش‌فرض برمی‌گردند */
export const ANOMALY_SETTING_IDS = [
  "pctVeryHigh","pctVeryLow","ciVeryHigh","ciVeryLow",
  "minCustomers","minConsumption","minPopulation","zeroThreshold","zeroMinCustomers","zeroRateHigh",
  "shareVolumeHigh","volumeMinPopulation","matHigh","matVeryHigh","manyCustomers","wAnomaly","wMaterial","band1","band2","band3",
  "topN","sortMode","method","includeArmed","disabledUsages",...ALERT_TYPES.map(a=>`alert.${a.id}`)
].map(k=>`anomaly.${k}`);
(function checkConfigVersion(){
  try{
    const saved = localStorage.getItem(VERSION_KEY);
    if(saved !== null && Number(saved) !== ANALYSIS_CONFIG_VERSION){
      ANOMALY_SETTING_IDS.forEach(id=>resetSetting(id));   // ساختار قدیمی ناسازگار → پیش‌فرض
    }
    localStorage.setItem(VERSION_KEY, String(ANALYSIS_CONFIG_VERSION));
  }catch{ /* localStorage در دسترس نیست → پیش‌فرض‌ها */ }
})();

export const fa = (n,d=0) => (n===null||n===undefined||!Number.isFinite(Number(n)))
  ? "—" : Number(n).toLocaleString("fa-IR",{maximumFractionDigits:d});

/** خواندن یکجای تنظیمات (تنها نقطهٔ دسترسی آستانه‌ها) */
export function readConfig(){
  const num = (id,dflt) => { const v = S(id); return Number.isFinite(v) ? v : dflt; };
  const alertsOn = {};
  ALERT_TYPES.forEach(a=>{ alertsOn[a.id] = S(`anomaly.alert.${a.id}`) !== false; });
  return {
    version: ANALYSIS_CONFIG_VERSION,
    pctVeryHigh:num("anomaly.pctVeryHigh",95), pctVeryLow:num("anomaly.pctVeryLow",5),
    /* ثابت داخلی (بدون تنظیم): فقط برای «وضعیت A–D» و هشدار «مشترک زیاد با مصرف کم» */
    pctRatherHigh:85, pctLow:10,
    ciVeryHigh:num("anomaly.ciVeryHigh",3), ciHigh:2, ciVeryLow:num("anomaly.ciVeryLow",0.4),
    minCustomers:num("anomaly.minCustomers",5), minConsumption:num("anomaly.minConsumption",100),
    minPopulation:Math.max(2,Math.round(num("anomaly.minPopulation",2))),
    zeroThreshold:num("anomaly.zeroThreshold",0), zeroMinCustomers:Math.max(1,num("anomaly.zeroMinCustomers",1)),
    zeroRateHigh:num("anomaly.zeroRateHigh",10),
    shareCap:num("anomaly.shareVolumeHigh",0.2), matHigh:num("anomaly.matHigh",70), matVeryHigh:num("anomaly.matVeryHigh",85),
    manyCustomers:num("anomaly.manyCustomers",50), volumeMinPop:Math.max(2,num("anomaly.volumeMinPopulation",5)),
    wAnomaly:num("anomaly.wAnomaly",60), wMaterial:num("anomaly.wMaterial",40),
    band1:num("anomaly.band1",25), band2:num("anomaly.band2",50), band3:num("anomaly.band3",75),
    topN:Math.max(1,Math.round(num("anomaly.topN",20))),
    sortMode:Math.round(num("anomaly.sortMode",5)), method:Math.round(num("anomaly.method",4)),
    includeArmed:S("anomaly.includeArmed") !== false,
    disabledUsages:Array.isArray(S("anomaly.disabledUsages")) ? S("anomaly.disabledUsages") : [],
    alertsOn
  };
}

/* ───────── ابزارهای آماری ───────── */
const isNum = v => typeof v === "number" && Number.isFinite(v);
function percentileRank(sortedAsc, value){
  if(!sortedAsc.length) return null;
  let below = 0, equal = 0;
  for(const v of sortedAsc){ if(v < value) below++; else if(v === value) equal++; else break; }
  return 100 * (below + 0.5 * equal) / sortedAsc.length;
}
function medianOf(arr){
  if(!arr.length) return null;
  const a = [...arr].sort((x,y)=>x-y), m = Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}
const clamp100 = v => Math.max(0, Math.min(100, v));

export function scoreBand(v, c=readConfig()){
  if(!isNum(v)) return null;
  if(v >= c.band3) return {id:"vhigh", label:"بسیار بالا"};
  if(v >= c.band2) return {id:"high", label:"بالا"};
  if(v >= c.band1) return {id:"mid", label:"متوسط"};
  return {id:"low", label:"پایین"};
}

/* ───────── پاک‌سازی، کیفیت داده و وضعیت رکورد ───────── */
const DQ_MSG = {
  NEGATIVE_CONSUMPTION:["error","مصرف منفی است؛ از رتبه‌بندی و صدک و CI کنار گذاشته شد."],
  NEGATIVE_CUSTOMERS:["error","تعداد مشترک منفی است؛ از تحلیل کنار گذاشته شد."],
  ZERO_CUSTOMERS:["warning","مشترک معتبر برای محاسبه سرانه وجود ندارد."],
  ZERO_CUSTOMERS_EMPTY:["info","مشترک و مصرف هر دو صفرند (رکورد خالی)."],
  ZERO_CONSUMPTION:["info","صفرمصرف معتبر (مشترک مثبت، مصرف دقیقاً صفر)؛ خطای داده نیست."],
  MISSING_DATA:["warning","داده ناقص است (نام شهر یا فیلد ضروری خالی است)."],
  UNKNOWN_CATEGORY:["error","نام کاربری ناشناخته/خالی است؛ در مقایسه کاربری‌ها نمی‌آید."],
  CITY_WITHOUT_AFFAIRS:["warning","شهر بدون امور؛ در تحلیل امور نمی‌آید (استان و شهر محاسبه می‌شود)."],
  DUPLICATE_POSSIBLE:["warning","رکورد تکراری احتمالی (کلید امور+شهر+کاربری چندبار آمده؛ مقادیر جمع شد)."],
  INVALID_NUMERIC_VALUE:["error","مقدار عددی نامعتبر است."]
};
export const DQ_LABEL = {
  NEGATIVE_CONSUMPTION:"مصرف منفی", NEGATIVE_CUSTOMERS:"مشترک منفی", ZERO_CUSTOMERS:"مشترک صفر",
  ZERO_CUSTOMERS_EMPTY:"رکورد خالی", ZERO_CONSUMPTION:"مصرف صفر", MISSING_DATA:"داده ناقص",
  UNKNOWN_CATEGORY:"کاربری ناشناخته", CITY_WITHOUT_AFFAIRS:"شهر بدون امور", DUPLICATE_POSSIBLE:"تکراری احتمالی",
  INVALID_NUMERIC_VALUE:"عدد نامعتبر"
};
const isTotalRow = r => [r.city, r.area, r.usage].some(x=>/^\s*جمع(\s|$)/.test(String(x||"")));
const mkKey = (area, city, usage) => `${PROVINCE_NAME}|${area}|${city}|${usage}`;

function dqEntry(code, recordKey, field, base, details){
  const [severity, message] = DQ_MSG[code] || ["warning", code];
  return {code, severity, message, recordKey, field, details:details||"",
    area:base.area, city:base.city, usage:base.usage, customers:base.customers, consumption:base.consumption};
}

/** ردیف‌های خام → رکوردهای تجمیعی امور×شهر×کاربری + کیفیت داده. Excel اصلی دست‌نخورده می‌ماند. */
export function prepareRows(rawRows, c=readConfig()){
  const dq = [], errors = [];
  const groups = new Map();
  let totalRowsSkipped = 0;
  for(const r of rawRows||[]){
    if(!r) continue;
    if(isTotalRow(r)){ totalRowsSkipped++; continue; }     // سرجمع‌ها هرگز رکورد شهر/کاربری نیستند
    const area = String(r.area||"").trim(), city = String(r.city||"").trim(), usage = String(r.usage||"").trim();
    const k = `${area}\0${city}\0${usage}`;
    if(!groups.has(k)) groups.set(k, {area, city, usage, settlementType:r.settlementType||"", rowsSeen:0, customers:0, consumption:0, invalid:false, raw:[]});
    const g = groups.get(k);
    g.rowsSeen++;
    const cu = r.customers, co = r.consumption;
    if(!isNum(cu) || !isNum(co)){ g.invalid = true; continue; }
    g.customers += cu; g.consumption += co;
  }
  const recs = [];
  for(const g of groups.values()){
    const key = mkKey(g.area, g.city, g.usage);
    const base = {area:g.area, city:g.city, usage:g.usage, customers:g.customers, consumption:g.consumption};
    const codes = [];
    const add = (code, field, det) => { codes.push(code); dq.push(dqEntry(code, key, field, base, det)); };
    if(g.invalid) add("INVALID_NUMERIC_VALUE","customers/consumption");
    if(!g.city) add("MISSING_DATA","city");
    if(!g.usage) add("UNKNOWN_CATEGORY","usage");
    if(!g.area) add("CITY_WITHOUT_AFFAIRS","area");
    if(g.rowsSeen > 1) add("DUPLICATE_POSSIBLE","recordKey", `${g.rowsSeen} ردیف`);
    if(g.consumption < 0) add("NEGATIVE_CONSUMPTION","consumption");
    if(g.customers < 0) add("NEGATIVE_CUSTOMERS","customers");
    if(g.customers === 0 && !g.invalid) add(g.consumption === 0 ? "ZERO_CUSTOMERS_EMPTY" : "ZERO_CUSTOMERS","customers");
    if(g.customers > 0 && g.consumption === 0) add("ZERO_CONSUMPTION","consumption");

    let status = "valid", exclusionReason = "";
    const hard = codes.some(x=>["NEGATIVE_CONSUMPTION","NEGATIVE_CUSTOMERS","INVALID_NUMERIC_VALUE","UNKNOWN_CATEGORY","MISSING_DATA"].includes(x));
    if(hard) status = "invalid";
    else if(codes.includes("ZERO_CUSTOMERS") || codes.includes("ZERO_CUSTOMERS_EMPTY") || codes.includes("CITY_WITHOUT_AFFAIRS")) status = "partial";
    if(status !== "invalid"){
      if(g.usage === ARMED_USAGE && !c.includeArmed){ status = "excluded"; exclusionReason = "نیروهای مسلح از دامنهٔ تحلیل خارج شده (تنظیمات)"; }
      else if(c.disabledUsages.includes(g.usage)){ status = "excluded"; exclusionReason = "کاربری در تنظیمات غیرفعال شده"; }
    }
    recs.push({
      recordKey:key, province:PROVINCE_NAME, affairs:g.area, area:g.area, city:g.city, category:g.usage, usage:g.usage,
      settlementType:g.settlementType, customers:g.customers, consumption:g.consumption,
      per:null, zeroCustomers:null, zeroRate:null, growth:null,
      status, exclusionReason, dqCodes:codes,
      provinceAnalysis:null, affairsAnalysis:null, cityAnalysis:null
    });
  }
  return {recs, dq, errors, totalRowsSkipped};
}

/* ───────── هستهٔ یک سطح تحلیل ───────── */
const emptyAnalysis = (reason, size=0) => ({
  rank:null, rankSize:size, percentile:null, ci:null, shareCons:null, shareCust:null,
  zeroRate:null, groupZeroRate:null, robustZ:null, medianPer:null,
  anomalyScore:null, materialityScore:null, priorityScore:null,
  alertTypes:[], profile:null, populationSize:size, available:false, reason:reason||""
});

/**
 * @param recs رکوردهای قابل تحلیل (status valid|partial)
 * @param groupOf (rec)=>کلید جامعهٔ مرجع یا null
 * @param level "province"|"affairs"|"city"
 */
function analyzeLevel(recs, groupOf, level, c){
  const groups = new Map();
  for(const r of recs){
    const gk = groupOf(r);
    if(gk === null) continue;
    if(!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(r);
  }
  const outKey = level+"Analysis";
  for(const list of groups.values()){
    const valid = list.filter(r=>r.per !== null);                 // مشترک>0 و مصرف>=0
    const perSorted = valid.map(r=>r.per).sort((a,b)=>a-b);
    const consSorted = valid.map(r=>r.consumption).sort((a,b)=>a-b);
    const custSorted = valid.map(r=>r.customers).sort((a,b)=>a-b);
    const totCons = list.reduce((s,r)=>s+r.consumption,0);
    const totCust = list.reduce((s,r)=>s+r.customers,0);
    const zeroCust = list.reduce((s,r)=>s + (r.zeroCustomers||0),0);
    const groupZeroRate = totCust > 0 ? 100*zeroCust/totCust : null;
    const n = valid.length;
    const enough = n >= c.minPopulation;
    const med = enough ? medianOf(perSorted) : null;
    let mad = null;
    if(enough) mad = medianOf(perSorted.map(v=>Math.abs(v-med)));
    const desc = [...perSorted].sort((a,b)=>b-a);

    for(const r of list){
      const a = emptyAnalysis("", n);
      a.groupZeroRate = groupZeroRate;
      a.zeroRate = r.zeroRate;
      if(r.per === null){ a.reason = "مشترک معتبر برای محاسبه سرانه وجود ندارد"; r[outKey] = a; continue; }
      if(!enough){ a.reason = "جامعهٔ آماری معتبر کافی نیست"; r[outKey] = a; continue; }
      a.available = true;
      a.percentile = percentileRank(perSorted, r.per);
      a.rank = 1 + desc.filter(v=>v > r.per).length;               // ۱ = بالاترین سرانه
      a.medianPer = med;
      if(mad > 0) a.robustZ = 0.6745*(r.per-med)/mad;
      else a.robustZ = r.per === med ? 0 : (r.per > med ? 10 : -10);
      a.shareCons = totCons > 0 ? r.consumption/totCons : null;
      a.shareCust = totCust > 0 ? r.customers/totCust : null;
      a.ci = (a.shareCons !== null && a.shareCust) ? a.shareCons/a.shareCust : null;
      /* Materiality (۰–۱۰۰): جایگاه مصرف و مشترک در جامعه + سهم مصرف؛ مستقل از Anomaly */
      const prC = percentileRank(consSorted, r.consumption)/100, prU = percentileRank(custSorted, r.customers)/100;
      const shareTerm = a.shareCons !== null ? Math.min(1, a.shareCons/Math.max(c.shareCap,1e-9)) : 0;
      a.materialityScore = clamp100(100*(0.5*prC + 0.3*prU + 0.2*shareTerm));
      /* Anomaly Score (۰–۱۰۰) */
      const comps = [];
      if(c.method===1 || c.method===3 || c.method===4) comps.push(clamp100((Math.max(a.percentile,100-a.percentile)-50)*2));
      if(c.method===2 || c.method===4) comps.push(clamp100(Math.abs(a.robustZ)*15));
      if((c.method===3 || c.method===4) && a.ci !== null && a.ci > 0) comps.push(clamp100(Math.abs(Math.log2(a.ci))*25));
      a.anomalyScore = comps.length ? Math.max(...comps) : null;
      const wSum = c.wAnomaly + c.wMaterial;
      a.priorityScore = wSum > 0 ? clamp100(((a.anomalyScore||0)*c.wAnomaly + a.materialityScore*c.wMaterial)/wSum) : null;
      /* هشدارها */
      const meetMin = r.customers >= c.minCustomers && r.consumption >= c.minConsumption;
      const al = [];
      const on = id => c.alertsOn[id] !== false;
      if(meetMin){
        if(a.percentile >= c.pctVeryHigh) al.push("veryHighPer");
        if(a.percentile <= c.pctVeryLow) al.push("veryLowPer");
        if(a.ci !== null){
          if(a.ci >= c.ciVeryHigh) al.push("ciVeryHigh");
          if(a.ci <= c.ciVeryLow) al.push("ciVeryLow");
        }
        if(level === "province" && n >= c.volumeMinPop && a.shareCons !== null && a.shareCons >= c.shareCap && a.materialityScore >= c.matVeryHigh) al.push("highVolume");
        if(a.percentile <= c.pctLow && r.customers >= Math.max(c.minCustomers, c.manyCustomers)) al.push("manyCustLowUse");
      }
      if(r.zeroRate !== null && r.zeroRate > 0 && r.customers >= c.zeroMinCustomers){
        al.push("zero");
        if(groupZeroRate !== null && groupZeroRate >= c.zeroRateHigh) al.push("highZeroRate");
      }
      a.alertTypes = al.filter(on);
      /* وضعیت تحلیلی A–D */
      const highPer = a.percentile >= c.pctRatherHigh, lowPer = a.percentile <= c.pctLow;
      const highCi = a.ci !== null && a.ci >= c.ciHigh;
      a.profile = highPer ? (highCi ? "A" : "B") : lowPer ? (highCi ? "C" : "D") : null;
      r[outKey] = a;
    }
    /* رکوردهای بدون تحلیل (نمونهٔ ناکافی) هم ساختار خالی خود را دارند */
  }
  for(const r of recs){ if(!r[outKey]) r[outKey] = emptyAnalysis(level==="affairs" && !r.area ? "شهر بدون امور" : "خارج از جامعهٔ آماری"); }
}

export const LEVELS = [
  {id:"province", key:"provinceAnalysis", label:"استان", en:"Province Benchmark", fa:"مقایسه با کل استان"},
  {id:"affairs",  key:"affairsAnalysis",  label:"امور",  en:"Affairs Benchmark", fa:"مقایسه با شهرهای امور"},
  {id:"city",     key:"cityAnalysis",     label:"شهر",   en:"City Internal Benchmark", fa:"مقایسه درون شهر"}
];
export const levelKey = id => (LEVELS.find(l=>l.id===id)||LEVELS[0]).key;

/* ───────── مرتب‌سازی ───────── */
export function sortValue(rec, key, mode){
  const a = rec[key] || {};
  const v = mode===1 ? rec.per : mode===2 ? a.ci : mode===3 ? a.anomalyScore : mode===4 ? a.materialityScore
    : mode===6 ? rec.consumption : a.priorityScore;
  return isNum(v) ? v : -Infinity;
}
export const sortFunction = (mode, key="provinceAnalysis") => (x,y) => sortValue(y,key,mode) - sortValue(x,key,mode);

/* ───────── ورودی اصلی ───────── */
/**
 * محاسبهٔ کامل، مستقل از فیلترهای نمایش. خروجی طبق «قرارداد خروجی» (analysisResult).
 * @param rawRows ردیف‌های خام (بدون سرجمع، شامل نیروهای مسلح)
 * @param opts {filters?:{level,areas,cities,usages}} — فقط برای متادیتا/Top N
 */
export function analyzeAnomalies(rawRows, opts={}){
  const errors = [];
  let c;
  try{ c = readConfig(); }
  catch(e){ errors.push({code:"CONFIGURATION_ERROR", severity:"error", message:"تنظیمات نامعتبر است؛ مقادیر پیش‌فرض اعمال شد.", recordKey:null, field:"config", details:String(e&&e.message||e)}); c = defaultConfig(); }

  let prep;
  try{ prep = prepareRows(rawRows, c); }
  catch(e){
    errors.push({code:"DATA_LOAD_ERROR", severity:"error", message:"خواندن داده انجام نشد.", recordKey:null, field:"rows", details:String(e&&e.message||e)});
    return emptyResult(c, opts, errors);
  }
  const {recs, dq, totalRowsSkipped} = prep;
  errors.push(...prep.errors);

  try{
    /* سرانه و صفرمصرف — فقط برای رکوردهای قابل تحلیل */
    const usable = recs.filter(r=>r.status==="valid" || r.status==="partial");
    for(const r of usable){
      if(r.customers > 0 && r.consumption >= 0){
        r.per = r.consumption / r.customers;
        const isZero = r.consumption <= c.zeroThreshold;
        r.zeroCustomers = isZero ? r.customers : 0;            // برآورد در سطح رکورد؛ تفکیک مشترک صفرمصرف در Excel نیست
        r.zeroRate = 100 * r.zeroCustomers / r.customers;
      }
    }
    analyzeLevel(usable, r=>r.category ? r.category : null, "province", c);
    analyzeLevel(usable, r=>(r.area && r.category) ? `${r.area}\0${r.category}` : null, "affairs", c);
    analyzeLevel(usable, r=>r.city ? `${r.area}\0${r.city}` : null, "city", c);
  }catch(e){
    errors.push({code:"CALCULATION_ERROR", severity:"error", message:"خطا در محاسبهٔ آماری.", recordKey:null, field:null, details:String(e&&e.message||e)});
  }

  return assemble(recs, dq, errors, c, opts, totalRowsSkipped);
}

export function defaultConfig(){
  return {version:ANALYSIS_CONFIG_VERSION, pctVeryHigh:95,pctRatherHigh:85,pctLow:10,pctVeryLow:5,
    ciVeryHigh:3,ciHigh:2,ciVeryLow:0.4,minCustomers:5,minConsumption:100,minPopulation:2,zeroThreshold:0,
    zeroMinCustomers:1,zeroRateHigh:10,shareCap:0.2,matHigh:70,matVeryHigh:85,manyCustomers:50,volumeMinPop:5,wAnomaly:60,wMaterial:40,
    band1:25,band2:50,band3:75,topN:20,sortMode:5,method:4,includeArmed:true,disabledUsages:[],alertsOn:{ciVeryLow:false}};
}

function emptyResult(c, opts, errors){
  return {metadata:{province:PROVINCE_NAME, configVersion:c.version, generatedAt:new Date().toISOString(), records:0},
    filters:opts.filters||{}, records:[], provinceAnalysis:[], affairsAnalysis:[], cityAnalysis:[],
    topNProvince:[], topNAffairs:[], topNCity:[], allAlerts:[], dataQuality:[], summary:{}, errors, cfg:c};
}

const hasAlert = (rec, key) => (rec[key]?.alertTypes?.length||0) > 0;
const flat = (rec, key) => ({recordKey:rec.recordKey, province:rec.province, affairs:rec.affairs, city:rec.city, category:rec.category, ...rec[key]});

function assemble(recs, dq, errors, c, opts, totalRowsSkipped){
  const analyzed = recs.filter(r=>r.status==="valid" || r.status==="partial");
  const excluded = recs.filter(r=>r.status==="excluded");
  const scoped = analyzed;
  const bySort = key => [...scoped].filter(r=>hasAlert(r,key)).sort(sortFunction(c.sortMode, key));
  const topNProvince = bySort("provinceAnalysis").slice(0, c.topN).map(r=>flat(r,"provinceAnalysis"));
  const topNAffairs = bySort("affairsAnalysis").slice(0, c.topN).map(r=>flat(r,"affairsAnalysis"));
  const topNCity = bySort("cityAnalysis").slice(0, c.topN).map(r=>flat(r,"cityAnalysis"));
  const allAlerts = scoped.filter(r=>LEVELS.some(l=>hasAlert(r,l.key))).map(r=>({
    recordKey:r.recordKey, province:r.province, affairs:r.affairs, city:r.city, category:r.category,
    levels:LEVELS.filter(l=>hasAlert(r,l.key)).map(l=>l.id),
    provinceAnalysis:r.provinceAnalysis, affairsAnalysis:r.affairsAnalysis, cityAnalysis:r.cityAnalysis
  }));
  const sevCount = s => dq.filter(d=>d.severity===s).length;
  const summary = {
    records:recs.length, analyzed:analyzed.length, excluded:excluded.length,
    invalid:recs.filter(r=>r.status==="invalid").length, partial:recs.filter(r=>r.status==="partial").length,
    totalRowsSkipped, dqErrors:sevCount("error"), dqWarnings:sevCount("warning"), dqInfo:sevCount("info"),
    alertsByLevel:Object.fromEntries(LEVELS.map(l=>[l.id, scoped.filter(r=>hasAlert(r,l.key)).length])),
    growth:{available:false, note:"داده دورهٔ قبل در فایل نیست؛ رشد/تغییر غیرعادی محاسبه نشد (null)."},
    zeroRateBasis:"برآورد در سطح رکورد (مصرف رکورد=۰)؛ تعداد مشترک صفرمصرف جداگانه در Excel وجود ندارد."
  };
  return {
    metadata:{province:PROVINCE_NAME, configVersion:c.version, generatedAt:new Date().toISOString(), records:recs.length,
      units:{per:"m³ / مشترک", consumption:"m³"}},
    filters:opts.filters||{},
    records:recs,
    provinceAnalysis:scoped.map(r=>flat(r,"provinceAnalysis")),
    affairsAnalysis:scoped.map(r=>flat(r,"affairsAnalysis")),
    cityAnalysis:scoped.map(r=>flat(r,"cityAnalysis")),
    topNProvince, topNAffairs, topNCity, allAlerts,
    dataQuality:dq, summary, errors, cfg:c
  };
}

/* ───────── کارت‌ها ───────── */
const has = (a, ...ids) => !!a && ids.some(i=>a.alertTypes.includes(i));
export const CARD_DEFS = [
  {id:"needsReview", label:"نیازمند بررسی", icon:"⚠️", test:a=>a&&a.alertTypes.length>0},
  {id:"veryHighPer", label:"مصرف سرانه بسیار بالا", icon:"🔺", test:a=>has(a,"veryHighPer")},
  {id:"veryLowPer", label:"مصرف سرانه بسیار پایین", icon:"🔻", test:a=>has(a,"veryLowPer")},
  {id:"zero", label:"صفرمصرف", icon:"⭕", test:a=>has(a,"zero")},
  {id:"highZeroRate", label:"درصد بالای صفرمصرف", icon:"∅", test:a=>has(a,"highZeroRate")},
  {id:"ciVeryHigh", label:"تمرکز بسیار شدید مصرف", icon:"🎯", test:a=>has(a,"ciVeryHigh")},
  {id:"ciVeryLow", label:"تمرکز بسیار پایین", icon:"◇", test:a=>has(a,"ciVeryLow")},
  {id:"highVolume", label:"حجم مصرف بسیار بالا", icon:"📦", test:a=>has(a,"highVolume")},
  {id:"manyCustLowUse", label:"مشترک زیاد با مصرف کم", icon:"👥", test:a=>has(a,"manyCustLowUse")}
];

export const PROFILE_LABEL = {
  A:"سرانه بالا + CI بالا — نیازمند بررسی",
  B:"سرانه بالا + CI عادی/پایین — نیازمند بررسی",
  C:"سرانه پایین + CI بالا — نیازمند بررسی",
  D:"سرانه پایین + CI پایین — نیازمند بررسی"
};

/* ───────── ساخت View (فیلتر نمایش؛ آمار را تغییر نمی‌دهد) ───────── */
/**
 * @param result خروجی analyzeAnomalies
 * @param v {level, areas[], cities[], usages[], alertType, dir:""|"high"|"low", minCust, minCons, sort, topOnly, topN}
 */
export function buildView(result, v){
  const c = result.cfg;
  const lv = LEVELS.find(l=>l.id===v.level) || LEVELS[0];
  const key = lv.key;
  const inUsage = r => !v.usages?.length || v.usages.includes(r.category);
  const inArea = r => !v.areas?.length || v.areas.includes(r.affairs);
  const inCity = r => !v.cities?.length || v.cities.includes(r.city);
  /* دامنهٔ هر سطح: استان = کل استان · امور = امور(های) انتخابی · شهر = شهر(های) انتخابی */
  const scopeOk = r => inUsage(r) && (lv.id==="province" || inArea(r)) && (lv.id!=="city" || inCity(r));
  const analyzed = result.records.filter(r=>r.status==="valid" || r.status==="partial");
  const scope = analyzed.filter(scopeOk);
  const minCust = Number(v.minCust)||0, minCons = Number(v.minCons)||0;
  const passLocal = r => r.customers >= minCust && r.consumption >= minCons;
  const alertOk = r => {
    const a = r[key]; if(!a || !a.alertTypes.length) return false;
    let ids = a.alertTypes;
    if(v.dir) ids = ids.filter(i=>ALERT_BY_ID[i].dir===v.dir);
    if(v.alertType) ids = ids.filter(i=>i===v.alertType);
    return ids.length>0;
  };
  const cards = {};
  for(const d of CARD_DEFS){
    cards[d.id] = d.test ? scope.filter(r=>d.test(r[key], c)).length : null;
  }
  const dqScope = result.dataQuality.filter(d=>{
    const inU = !v.usages?.length || v.usages.includes(d.usage);
    const inA = lv.id==="province" || !v.areas?.length || v.areas.includes(d.area);
    const inC = lv.id!=="city" || !v.cities?.length || v.cities.includes(d.city);
    return inU && inA && inC;
  });
  cards.quality = dqScope.filter(d=>d.severity!=="info").length;

  let list;
  if(v.card==="quality") list = null;
  else{
    const def = CARD_DEFS.find(d=>d.id===v.card) || CARD_DEFS[0];
    list = scope.filter(r=>def.test(r[key], c) && passLocal(r) && (v.card==="needsReview" ? alertOk(r) : (!v.alertType && !v.dir) || alertOk(r)));
    list.sort(sortFunction(v.sort||c.sortMode, key));
  }
  const totalMatching = list ? list.length : null;
  const topN = Math.max(1, Math.round(v.topN||c.topN));
  const rows = list ? (v.topOnly ? list.slice(0, topN) : list) : null;

  /* خلاصهٔ استان — همیشه از کل استان (با فیلتر کاربری) */
  const prov = analyzed.filter(inUsage);
  const provinceSummary = {};
  for(const d of CARD_DEFS){ if(d.test) provinceSummary[d.id] = prov.filter(r=>d.test(r.provinceAnalysis, c)).length; }
  const affSummary = {}, citySummary = {};
  for(const d of CARD_DEFS){
    if(!d.test) continue;
    affSummary[d.id] = analyzed.filter(r=>inUsage(r)&&inArea(r)).filter(r=>d.test(r.affairsAnalysis,c)).length;
    citySummary[d.id] = analyzed.filter(r=>inUsage(r)&&inArea(r)&&inCity(r)).filter(r=>d.test(r.cityAnalysis,c)).length;
  }
  return {level:lv.id, key, scope, cards, rows, totalMatching, topN, dq:dqScope, provinceSummary, affSummary, citySummary,
    scatter:scope.filter(passLocal)};
}
